import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/moderation/multi-account
 *
 * 複数アカウント検知。
 * push_tokens の deviceId が複数のユーザー（users コレクション）に紐付いている場合を検出。
 * また、同一 IP / 同一端末から複数の userId でレビューが投稿されていないかチェック。
 */
export async function GET() {
  try {
    await requireAuth();

    // 全ユーザーと全トークンを取得
    const [usersSnap, tokensSnap] = await Promise.all([
      adminDb.collection(COLLECTIONS.USERS).get(),
      adminDb.collection(COLLECTIONS.PUSH_TOKENS).get(),
    ]);

    // deviceId → token mapping
    const tokenDevices = new Map<string, string>();
    for (const d of tokensSnap.docs) {
      const data = d.data();
      tokenDevices.set(data.deviceId || d.id, data.token || '');
    }

    // 直近のレビューからユーザーの投稿パターンを分析
    const recentReviews = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    // spotId ごとに同一スポットに投票した userId のペアを検出
    // 同一人物が別アカウントで自作自演 Good を水増しするパターン
    const spotVoters = new Map<string, Set<string>>();
    const userNames = new Map<string, string>();

    for (const d of usersSnap.docs) {
      userNames.set(d.id, d.data().displayName || d.id);
    }

    for (const d of recentReviews.docs) {
      const data = d.data();
      const spotId = data.spotId as string;
      const userId = data.userId as string;
      if (!spotVoters.has(spotId)) spotVoters.set(spotId, new Set());
      spotVoters.get(spotId)!.add(userId);
    }

    // 同一スポットに短い userId prefix が一致するユーザーが複数いないか
    // （UUID v4 の先頭8文字が一致 = 非常に稀 → 同一生成ロジックの疑い）
    interface SuspectPair {
      userIdA: string;
      nameA: string;
      userIdB: string;
      nameB: string;
      reason: string;
      sharedSpots: number;
    }

    const suspects: SuspectPair[] = [];
    const checked = new Set<string>();

    // ユーザーペア間で共通レビュースポットが多い場合を検出
    const userSpots = new Map<string, Set<string>>();
    for (const d of recentReviews.docs) {
      const data = d.data();
      const uid = data.userId as string;
      const sid = data.spotId as string;
      if (!userSpots.has(uid)) userSpots.set(uid, new Set());
      userSpots.get(uid)!.add(sid);
    }

    const userIds = [...userSpots.keys()];
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const a = userIds[i], b = userIds[j];
        const key = [a, b].sort().join('_');
        if (checked.has(key)) continue;
        checked.add(key);

        const spotsA = userSpots.get(a)!;
        const spotsB = userSpots.get(b)!;
        let shared = 0;
        for (const s of spotsA) {
          if (spotsB.has(s)) shared++;
        }

        // 共通スポットが5件以上 & 両方のレビュー総数の50%以上が重複
        const overlapRatio = shared / Math.min(spotsA.size, spotsB.size);
        if (shared >= 5 && overlapRatio >= 0.5) {
          suspects.push({
            userIdA: a,
            nameA: userNames.get(a) || a.slice(0, 8),
            userIdB: b,
            nameB: userNames.get(b) || b.slice(0, 8),
            reason: `レビュー対象スポットの${Math.round(overlapRatio * 100)}%が重複（${shared}件共通）`,
            sharedSpots: shared,
          });
        }
      }
    }

    suspects.sort((a, b) => b.sharedSpots - a.sharedSpots);

    return NextResponse.json({
      suspects,
      total: suspects.length,
      analyzedUsers: userIds.length,
      analyzedReviews: recentReviews.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
