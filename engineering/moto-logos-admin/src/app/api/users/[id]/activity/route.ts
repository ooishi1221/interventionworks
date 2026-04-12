import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/users/[id]/activity
 *
 * ユーザーの行動ログ（レビュー・スポット登録・投票）を統合タイムラインで返す。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: userId } = await context.params;

    // 並行取得
    const [reviewsSnap, spotsSnap] = await Promise.all([
      adminDb.collection(COLLECTIONS.REVIEWS)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
      adminDb.collection(COLLECTIONS.SPOTS)
        .where('createdBy', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
    ]);

    type LogEntry = {
      type: 'review' | 'spot';
      id: string;
      detail: string;
      createdAt: string;
    };

    const entries: LogEntry[] = [];

    for (const d of reviewsSnap.docs) {
      const data = d.data();
      const ts = data.createdAt?.toDate?.();
      entries.push({
        type: 'review',
        id: d.id,
        detail: `スポット ${data.spotId} に ${data.score}点のレビュー${data.comment ? `: ${(data.comment as string).slice(0, 50)}` : ''}`,
        createdAt: ts?.toISOString() ?? '',
      });
    }

    for (const d of spotsSnap.docs) {
      const data = d.data();
      const ts = data.createdAt?.toDate?.();
      entries.push({
        type: 'spot',
        id: d.id,
        detail: `スポット「${data.name}」を登録`,
        createdAt: ts?.toISOString() ?? '',
      });
    }

    // 日時降順ソート
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ activity: entries.slice(0, 50) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
