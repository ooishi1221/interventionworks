import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/map-updates/[reviewId]/skip
 *
 * レビューを地図更新対象からスキップする。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  try {
    await requireAuth('moderator');
    const { reviewId } = await context.params;

    const ref = adminDb.collection(COLLECTIONS.REVIEWS).doc(reviewId);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'レビューが見つかりません' }, { status: 404 });
    }

    await ref.update({
      mapUpdateStatus: 'skipped',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
