import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const RETENTION_LOG = 'retention_log';
/** 到着トリガー: 直近24時間以内の到着を検出（1日1回実行） */
const ARRIVAL_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 閲覧インパクト: 前回通知からの閲覧増分がこの閾値を超えたら通知 */
const VIEW_THRESHOLD = 5;
/** デデュプ: 同じユーザー×タイプは1日1回まで */
const DEDUP_HOURS = 24;

export interface RetentionNotifyResult {
  arrivalSent: number;
  impactSent: number;
  totalErrors: number;
  message: string;
}

/**
 * リテンション通知 — B→Aの橋。
 *
 * 1. 到着トリガー: 昨日の到着をまとめて検出
 *    → そのスポットに足跡を残した別ユーザーにプッシュ
 *
 * 2. 閲覧インパクト: viewCount が前回通知時から一定数増えたスポット
 *    → スポット投稿者にプッシュ
 */
export async function processRetentionNotify(): Promise<RetentionNotifyResult> {
  const now = new Date();
  let arrivalSent = 0;
  let impactSent = 0;
  let totalErrors = 0;

  // ════════════════════════════════════════════════════
  // 1. 到着トリガー通知（昨日の到着をまとめて通知）
  // ════════════════════════════════════════════════════
  const arrivalCutoff = new Date(now.getTime() - ARRIVAL_WINDOW_MS);

  const recentSpots = await adminDb
    .collection(COLLECTIONS.SPOTS)
    .where('currentParkedAt', '>=', arrivalCutoff)
    .get();

  const userArrivalSpots = new Map<string, { spotId: string; spotName: string }[]>();

  for (const spotDoc of recentSpots.docs) {
    const spot = spotDoc.data();
    const spotId = spotDoc.id;
    const spotName = (spot.name as string) || 'スポット';

    const reviewsSnap = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('spotId', '==', spotId)
      .get();

    const footprintUserIds = new Set<string>();
    for (const r of reviewsSnap.docs) {
      const uid = r.data().userId as string | undefined;
      if (uid) footprintUserIds.add(uid);
    }
    const createdBy = spot.createdBy as string | undefined;
    if (createdBy) footprintUserIds.add(createdBy);

    const arrivedBy = spot.currentParkedBy as string | undefined;

    for (const userId of footprintUserIds) {
      if (userId === arrivedBy) continue;
      const list = userArrivalSpots.get(userId) || [];
      list.push({ spotId, spotName });
      userArrivalSpots.set(userId, list);
    }
  }

  for (const [userId, spots] of userArrivalSpots) {
    if (await isDuplicate(userId, 'daily', 'arrival', DEDUP_HOURS)) continue;

    const token = await getToken(userId);
    if (!token) continue;

    const body =
      spots.length === 1
        ? `昨日${spots[0].spotName}にライダーが到着。あなたの足跡が道標になった`
        : `昨日${spots.length}件のスポットにライダーが到着。あなたの足跡が道標になった`;

    const sent = await sendPush(token, {
      title: '足跡が繋がった',
      body,
      data: { type: 'retention_arrival', spotId: spots[0].spotId },
    });

    if (sent) {
      arrivalSent++;
      await logRetention(userId, 'daily', 'arrival');
    } else {
      totalErrors++;
    }
  }

  // ════════════════════════════════════════════════════
  // 2. 閲覧インパクト通知
  // ════════════════════════════════════════════════════
  const impactLogSnap = await adminDb
    .collection(RETENTION_LOG)
    .where('type', '==', 'impact')
    .get();

  const lastViewsByUser = new Map<string, { totalViews: number; docId: string }>();
  for (const doc of impactLogSnap.docs) {
    const data = doc.data();
    const uid = data.userId as string;
    const existing = lastViewsByUser.get(uid);
    if (!existing) {
      lastViewsByUser.set(uid, { totalViews: (data.totalViews as number) || 0, docId: doc.id });
    }
  }

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
    if (await isDuplicate(userId, 'global', 'impact_check', DEDUP_HOURS)) continue;

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
        await logRetention(userId, 'global', 'impact', totalViews);
      } else {
        totalErrors++;
      }
    }

    await logRetention(userId, 'global', 'impact_check');
  }

  console.log(
    `[cron/retention-notify] 到着通知: ${arrivalSent}件 / インパクト通知: ${impactSent}件 / エラー: ${totalErrors}件`,
  );

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

  return {
    arrivalSent,
    impactSent,
    totalErrors,
    message: `到着通知${arrivalSent}件 + インパクト通知${impactSent}件を送信`,
  };
}

// ─── ヘルパー ─────────────────────────────────────────

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

async function getToken(userId: string): Promise<string | null> {
  const doc = await adminDb.collection(COLLECTIONS.PUSH_TOKENS).doc(userId).get();
  if (!doc.exists) return null;
  return (doc.data()?.token as string) || null;
}

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

async function getUserTotalViews(userId: string): Promise<number> {
  let total = 0;

  const createdSnap = await adminDb
    .collection(COLLECTIONS.SPOTS)
    .where('createdBy', '==', userId)
    .select('viewCount')
    .get();
  for (const s of createdSnap.docs) {
    total += (s.data().viewCount as number) || 0;
  }

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
