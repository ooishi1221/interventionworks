import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/users/ranking?period=week|month
 *
 * 週間/月間の貢献者ランキング。
 * レビュー投稿数 + スポット登録数でスコアリング。
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const period = searchParams.get('period') || 'week';

    const now = new Date();
    const since = new Date(now);
    if (period === 'month') {
      since.setDate(since.getDate() - 30);
    } else {
      since.setDate(since.getDate() - 7);
    }

    // 期間内のレビューを取得
    const reviewsSnap = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('createdAt', '>=', since)
      .get();

    // 期間内のスポット登録を取得
    const spotsSnap = await adminDb
      .collection(COLLECTIONS.SPOTS)
      .where('source', '==', 'user')
      .where('createdAt', '>=', since)
      .get();

    // ユーザーごとにスコア集計
    const scores = new Map<string, { reviews: number; spots: number }>();

    for (const d of reviewsSnap.docs) {
      const uid = d.data().userId as string;
      const entry = scores.get(uid) || { reviews: 0, spots: 0 };
      entry.reviews++;
      scores.set(uid, entry);
    }

    for (const d of spotsSnap.docs) {
      const uid = d.data().createdBy as string | undefined;
      if (!uid) continue;
      const entry = scores.get(uid) || { reviews: 0, spots: 0 };
      entry.spots++;
      scores.set(uid, entry);
    }

    // スコア計算: レビュー1点 + スポット登録3点
    const ranking = [...scores.entries()]
      .map(([userId, { reviews, spots }]) => ({
        userId,
        reviews,
        spots,
        score: reviews + spots * 3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    // ユーザー名を解決
    const userIds = ranking.map((r) => r.userId);
    const nameMap = new Map<string, string>();
    for (let i = 0; i < userIds.length; i += 10) {
      const batch = userIds.slice(i, i + 10);
      for (const uid of batch) {
        const doc = await adminDb.collection(COLLECTIONS.USERS).doc(uid).get();
        if (doc.exists) nameMap.set(uid, doc.data()?.displayName || uid.slice(0, 8));
      }
    }

    const result = ranking.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      displayName: nameMap.get(r.userId) || r.userId.slice(0, 8),
      reviews: r.reviews,
      spots: r.spots,
      score: r.score,
    }));

    return NextResponse.json({ ranking: result, period });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
