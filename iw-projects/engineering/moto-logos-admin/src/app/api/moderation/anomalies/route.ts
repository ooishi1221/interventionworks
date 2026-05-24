import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/moderation/anomalies
 *
 * 異常行動パターンを検出:
 * 1. スパム: 同一ユーザーが5分以内に10件以上レビュー投稿
 * 2. Bad爆撃: 同一ユーザーが短時間に大量のBad報告（reviews.badCount 操作はないが spot reports を検出）
 * 3. 高頻度投稿: 直近24hでレビュー数が異常に多いユーザー
 */

interface Anomaly {
  type: 'spam' | 'high_frequency' | 'suspicious_score';
  userId: string;
  detail: string;
  count: number;
  createdAt: string;
}

export async function GET() {
  try {
    await requireAuth();

    const anomalies: Anomaly[] = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 直近24hのレビューを全取得
    const reviewsSnap = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('createdAt', '>=', oneDayAgo)
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    // ユーザーごとにグループ化
    const userReviews = new Map<string, { createdAt: Date; spotId: string }[]>();
    for (const d of reviewsSnap.docs) {
      const data = d.data();
      const uid = data.userId as string;
      const ts = data.createdAt?.toDate?.() ?? new Date();
      if (!userReviews.has(uid)) userReviews.set(uid, []);
      userReviews.get(uid)!.push({ createdAt: ts, spotId: data.spotId as string });
    }

    for (const [userId, reviews] of userReviews) {
      // 1) 高頻度: 24hで20件以上
      if (reviews.length >= 20) {
        anomalies.push({
          type: 'high_frequency',
          userId,
          detail: `24時間で${reviews.length}件のレビューを投稿`,
          count: reviews.length,
          createdAt: reviews[0].createdAt.toISOString(),
        });
      }

      // 2) スパム: 5分以内に10件以上
      reviews.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (let i = 0; i <= reviews.length - 10; i++) {
        const window = reviews[i + 9].createdAt.getTime() - reviews[i].createdAt.getTime();
        if (window <= 5 * 60 * 1000) {
          anomalies.push({
            type: 'spam',
            userId,
            detail: `5分以内に10件のレビューを投稿（スパム疑い）`,
            count: 10,
            createdAt: reviews[i].createdAt.toISOString(),
          });
          break; // 同一ユーザーは1回だけ
        }
      }

      // 3) 同一スポットへの重複: 同一spotIdに3件以上
      const spotCounts = new Map<string, number>();
      for (const r of reviews) {
        spotCounts.set(r.spotId, (spotCounts.get(r.spotId) || 0) + 1);
      }
      for (const [spotId, count] of spotCounts) {
        if (count >= 3) {
          anomalies.push({
            type: 'suspicious_score',
            userId,
            detail: `スポット ${spotId} に24時間で${count}件のレビュー（評価操作疑い）`,
            count,
            createdAt: reviews[0].createdAt.toISOString(),
          });
        }
      }
    }

    // 重複排除 & ソート
    anomalies.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ anomalies, total: anomalies.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
