import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type MapUpdateReviewResponse, type MapUpdateStatus } from '@/lib/types';

/**
 * GET /api/map-updates
 *
 * 写真付きレビューの地図更新候補一覧。
 * status フィルタ（pending / analyzed / applied / skipped）。
 * デフォルトは pending（未処理）。
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = (searchParams.get('status') || 'pending') as MapUpdateStatus;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    let nextCursor: string | null = null;

    if (status === 'pending') {
      // pending: mapUpdateStatus が 'pending' または未設定のもの
      // Firestore では「フィールドなし OR 値が pending」を単一クエリで取れないため、
      // 全写真付きレビューから analyzed/applied/skipped を除外
      const allQuery = adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .orderBy('createdAt', 'desc');

      const allSnap = await allQuery.limit(limit * 3).get();

      // analyzed/applied/skipped 以外 = pending or 未設定
      const pendingDocs = allSnap.docs.filter((d) => {
        const s = d.data().mapUpdateStatus;
        return !s || s === 'pending';
      });

      docs = pendingDocs.slice(0, limit);
      nextCursor = docs.length >= limit ? docs[docs.length - 1].id : null;
    } else {
      // analyzed / applied / skipped
      let query: FirebaseFirestore.Query = adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .where('mapUpdateStatus', '==', status)
        .orderBy('createdAt', 'desc');

      if (cursor) {
        const cursorDoc = await adminDb.collection(COLLECTIONS.REVIEWS).doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snap = await query.limit(limit + 1).get();
      const hasMore = snap.docs.length > limit;
      docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      nextCursor = hasMore ? docs[docs.length - 1].id : null;
    }

    // スポット情報を結合
    const spotIds = [...new Set(docs.map((d) => d.data().spotId as string))];
    const spotMap = new Map<string, Record<string, unknown>>();

    for (const sid of spotIds) {
      const spotDoc = await adminDb.collection(COLLECTIONS.SPOTS).doc(sid).get();
      if (spotDoc.exists) {
        spotMap.set(sid, spotDoc.data()!);
      }
    }

    const reviews: MapUpdateReviewResponse[] = docs.map((d) => {
      const data = d.data();
      const spotId = data.spotId as string;
      const spot = spotMap.get(spotId);

      return {
        reviewId: d.id,
        spotId,
        spotName: (spot?.name as string) || spotId,
        userId: data.userId as string,
        photoUrls: (data.photoUrls as string[]) || [],
        photoTag: data.photoTag || undefined,
        comment: data.comment || undefined,
        score: data.score as number,
        mapUpdateStatus: (data.mapUpdateStatus as MapUpdateStatus) || 'pending',
        mapUpdateAnalysis: data.mapUpdateAnalysis || undefined,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
        currentSpot: spot
          ? {
              priceInfo: spot.priceInfo as string | undefined,
              openHours: spot.openHours as string | undefined,
              parkingCapacity: spot.parkingCapacity as number | undefined,
              isFree: spot.isFree as boolean | undefined,
              payment: spot.payment as { cash: boolean; icCard: boolean; qrCode: boolean } | undefined,
              capacity: spot.capacity as { is50only: boolean; upTo125: boolean; upTo400: boolean; isLargeOk: boolean } | undefined,
            }
          : undefined,
      };
    });

    return NextResponse.json({ reviews, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
