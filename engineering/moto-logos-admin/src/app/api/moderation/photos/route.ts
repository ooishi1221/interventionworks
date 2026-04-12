import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/moderation/photos
 *
 * 写真付きレビューの目視確認キュー。
 * photoUrls が空でないレビューを新しい順に返す。
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('photoUrls', '!=', [])
      .orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.REVIEWS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.limit(limit + 1).get();
    const hasMore = snap.docs.length > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

    // スポット名解決
    const spotIds = [...new Set(docs.map((d) => d.data().spotId as string))];
    const spotNames = new Map<string, string>();
    for (let i = 0; i < spotIds.length; i += 10) {
      const batch = spotIds.slice(i, i + 10);
      for (const sid of batch) {
        const spotDoc = await adminDb.collection(COLLECTIONS.SPOTS).doc(sid).get();
        if (spotDoc.exists) spotNames.set(sid, spotDoc.data()?.name || sid);
      }
    }

    const photos = docs.map((d) => {
      const data = d.data();
      return {
        reviewId: d.id,
        spotId: data.spotId,
        spotName: spotNames.get(data.spotId as string) || data.spotId,
        userId: data.userId,
        photoUrls: data.photoUrls || [],
        score: data.score,
        comment: data.comment || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ photos, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
