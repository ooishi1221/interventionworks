import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const user = await requireAuth('moderator');
    const { spotIds } = await request.json();

    if (!Array.isArray(spotIds) || spotIds.length === 0) {
      return NextResponse.json({ error: 'spotIds は必須です' }, { status: 400 });
    }

    let deletedSpots = 0;
    let deletedReviews = 0;

    for (const id of spotIds) {
      const docRef = adminDb.collection(COLLECTIONS.SPOTS).doc(id);
      const doc = await docRef.get();
      if (!doc.exists) continue;

      const spotData = doc.data()!;

      // 関連レビューを取得・削除
      const reviewsSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('spotId', '==', id)
        .get();

      const refs = [docRef, ...reviewsSnap.docs.map((d) => d.ref)];
      for (let i = 0; i < refs.length; i += 500) {
        const batch = adminDb.batch();
        refs.slice(i, i + 500).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      deletedSpots++;
      deletedReviews += reviewsSnap.size;

      await writeAuditLog({
        adminId: user.uid,
        adminEmail: user.email,
        action: 'spot.bulk_delete',
        targetType: 'spot',
        targetId: id,
        previousState: { name: spotData.name, status: spotData.status, source: spotData.source },
        newState: { deleted: true },
      });
    }

    return NextResponse.json({ success: true, deletedSpots, deletedReviews });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
