import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const RETENTION_LOG = 'retention_log';
const BATCH_SIZE = 100;
/** 到着トリガー: 直近30分以内の到着を検出 */
const ARRIVAL_WINDOW_MS = 30 * 60 * 1000;
/** 閲覧インパクト: 前回通知からの閲覧増分がこの閾値を超えたら通知 */
const VIEW_THRESHOLD = 5;
/** デデュプ: 同じユーザー×タイプは1日1回まで */
const DEDUP_HOURS = 24;

/**
 * GET /api/cron/retention-notify
 *
 * リテンション通知 — B→Aの橋。30分間隔で実行。
 *
 * 1. 到着トリガー: 直近30分に到着があったスポットを検出
 *    → そのスポットに足跡を残した別ユーザーにプッシュ
 *    「○○に新しいライダーが到着。あなたの足跡を辿ってきたかも」
 *
 * 2. 閲覧インパクト: viewCount が前回通知時から一定数増えたスポット
 *    → スポット投稿者にプッシュ
 *    「あなたの足跡がN人のライダーの役に立ちました」
 */
export async function GET(request: Request) {
  try {
    // ── Cron シークレット検証 ──
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[cron/retention-notify] CRON_SECRET が設定されていません');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    let arrivalSent = 0;
    let impactSent = 0;
    let totalErrors = 0;

    // ════════════════════════════════════════════════════
    // 1. 到着トリガー通知
    // ════════════════════════════════════════════════════
    const arrivalCutoff = new Date(now.getTime() - ARRIVAL_WINDOW_MS);

    const recentSpots = await adminDb
      .collection(COLLECTIONS.SPOTS)
      .where('currentParkedAt', '>=', arrivalCutoff)
      .get();

    for (const spotDoc of recentSpots.docs) {
      const spot = spotDoc.data();
      const spotId = spotDoc.id;
      const spotName = (spot.name as string) || 'スポット';

      // このスポットに足跡を残したユーザーを取得
      const reviewsSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('spotId', '==', spotId)
        .get();

      const footprintUserIds = new Set<string>();
      for (const r of reviewsSnap.docs) {
        const uid = r.data().userId as string | undefined;
        if (uid) footprintUserIds.add(uid);
      }
      // スポット作成者も含める
      const createdBy = spot.createdBy as string | undefined;
      if (createdBy) footprintUserIds.add(createdBy);

      if (footprintUserIds.size === 0) continue;

      // 到着者自身は除外（currentParkedBy があれば）
      const arrivedBy = spot.currentParkedBy as string | undefined;

      for (const userId of footprintUserIds) {
        if (userId === arrivedBy) continue;

        // デデュプチェック
        if (await isDuplicate(userId, spotId, 'arrival', DEDUP_HOURS)) continue;

        // プッシュトークン取得
        const token = await getToken(userId);
        if (!token) continue;

        const sent = await sendPush(token, {
          title: '足跡が繋がった',
          body: `${spotName}に新しいライダーが到着。あなたの足跡を辿ってきたかも`,
          data: { type: 'retention_arrival', spotId },
        });

        if (sent) {
          arrivalSent++;
          await logRetention(userId, spotId, 'arrival');
        } else {
          totalErrors++;
        }
      }
    }

    // ════════════════════════════════════════════════════
    // 2. 閲覧インパクト通知
    // ════════════════════════════════════════════════════

    // retention_log から各ユーザーの前回通知時の合計閲覧数を取得
    // → 現在の合計と比較 → 増分がしきい値を超えたら通知
    const impactLogSnap = await adminDb
      .collection(RETENTION_LOG)
      .where('type', '==', 'impact')
      .get();

    // ユーザーごとの前回閲覧数
    const lastViewsByUser = new Map<string, { totalViews: number; docId: string }>();
    for (const doc of impactLogSnap.docs) {
      const data = doc.data();
      const uid = data.userId as string;
      const existing = lastViewsByUser.get(uid);
      // 最新のログを使う
      if (!existing) {
        lastViewsByUser.set(uid, { totalViews: (data.totalViews as number) || 0, docId: doc.id });
      }
    }

    // アクティブユーザー（push_tokens が存在）のスポット閲覧数を集計
    const tokenSnap = await adminDb.collection(COLLECTIONS.PUSH_TOKENS).get();
    const activeUserIds = new Set<string>();
    const tokenMap = new Map<string, string>();
    for (const t of tokenSnap.docs) {
      const data = t.data();
      const uid = data.deviceId as string;
      const token = data.token as string;
      if (uid && token) {
        activeUserIds.add(uid);
        tokenMap.set(uid, token);
      }
    }

    for (const userId of activeUserIds) {
      // デデュプ: impact は1日1回
      if (await isDuplicate(userId, 'global', 'impact_check', DEDUP_HOURS)) continue;

      // このユーザーが作成したスポット + レビューしたスポットの viewCount 合計
      const totalViews = await getUserTotalViews(userId);
      const prev = lastViewsByUser.get(userId);
      const prevViews = prev?.totalViews ?? 0;
      const increment = totalViews - prevViews;

      if (increment >= VIEW_THRESHOLD) {
        const token = tokenMap.get(userId);
        if (!token) continue;

        const sent = await sendPush(token, {
          title: 'あなたの足跡が役に立った',
          body: `あなたの足跡が${totalViews}人のライダーの役に立ちました`,
          data: { type: 'retention_impact' },
        });

        if (sent) {
          impactSent++;
          // 最新の合計閲覧数を記録
          await logRetention(userId, 'global', 'impact', totalViews);
        } else {
          totalErrors++;
        }
      }

      // impact_check のデデュプログ（閲覧数未達でも1日1回チェック済みを記録）
      await logRetention(userId, 'global', 'impact_check');
    }

    console.log(`[cron/retention-notify] 到着通知: ${arrivalSent}件 / インパクト通知: ${impactSent}件 / エラー: ${totalErrors}件`);

    await writeAuditLog({
      adminId: 'system',
      adminEmail: 'cron@moto-logos.system',
      action: 'retention_notification.send',
      targetType: 'notification' as never,
      targetId: 'retention-notify',
      reason: `リテンション通知: 到着${arrivalSent}件 + インパクト${impactSent}件`,
      previousState: {},
      newState: { arrivalSent, impactSent, totalErrors },
    });

    return NextResponse.json({
      arrivalSent,
      impactSent,
      totalErrors,
      message: `到着通知${arrivalSent}件 + インパクト通知${impactSent}件を送信`,
    });
  } catch (error) {
    console.error('[cron/retention-notify] エラー:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── ヘルパー ─────────────────────────────────────────

/** Expo Push API で1件送信 */
async function sendPush(
  token: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        data: payload.data,
      }),
    });
    if (!res.ok) return false;
    const result = await res.json();
    return result.data?.status === 'ok';
  } catch {
    return false;
  }
}

/** push_tokens からトークンを取得 */
async function getToken(userId: string): Promise<string | null> {
  const doc = await adminDb.collection(COLLECTIONS.PUSH_TOKENS).doc(userId).get();
  if (!doc.exists) return null;
  return (doc.data()?.token as string) || null;
}

/** デデュプチェック — 同じ userId × spotId × type が DEDUP_HOURS 以内にあるか */
async function isDuplicate(
  userId: string,
  spotId: string,
  type: string,
  hours: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const snap = await adminDb
    .collection(RETENTION_LOG)
    .where('userId', '==', userId)
    .where('spotId', '==', spotId)
    .where('type', '==', type)
    .where('createdAt', '>=', cutoff)
    .limit(1)
    .get();
  return !snap.empty;
}

/** デデュプログを書き込む */
async function logRetention(
  userId: string,
  spotId: string,
  type: string,
  totalViews?: number,
): Promise<void> {
  const data: Record<string, unknown> = {
    userId,
    spotId,
    type,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (totalViews !== undefined) data.totalViews = totalViews;
  await adminDb.collection(RETENTION_LOG).add(data);
}

/** ユーザーが関与したスポットの合計 viewCount を取得 */
async function getUserTotalViews(userId: string): Promise<number> {
  let total = 0;

  // ユーザーが作成したスポット
  const createdSnap = await adminDb
    .collection(COLLECTIONS.SPOTS)
    .where('createdBy', '==', userId)
    .select('viewCount')
    .get();
  for (const s of createdSnap.docs) {
    total += (s.data().viewCount as number) || 0;
  }

  // ユーザーがレビューしたスポット
  const reviewSnap = await adminDb
    .collection(COLLECTIONS.REVIEWS)
    .where('userId', '==', userId)
    .select('spotId')
    .get();

  const reviewedSpotIds = new Set<string>();
  for (const r of reviewSnap.docs) {
    const sid = r.data().spotId as string;
    if (sid) reviewedSpotIds.add(sid);
  }

  // 重複排除（作成したスポットのviewCountは既にカウント済み）
  const createdSpotIds = new Set(createdSnap.docs.map((d) => d.id));
  const additionalIds = [...reviewedSpotIds].filter((id) => !createdSpotIds.has(id));

  for (let i = 0; i < additionalIds.length; i += 10) {
    const batch = additionalIds.slice(i, i + 10);
    const spotsSnap = await adminDb
      .collection(COLLECTIONS.SPOTS)
      .where('__name__', 'in', batch)
      .select('viewCount')
      .get();
    for (const s of spotsSnap.docs) {
      total += (s.data().viewCount as number) || 0;
    }
  }

  return total;
}
