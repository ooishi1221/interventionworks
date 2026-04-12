import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import {
  COLLECTIONS,
  type ReportResponse,
  type ReportStatus,
} from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as ReportStatus | null;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.REPORTS);

    if (status) query = query.where('status', '==', status);

    query = query.orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.REPORTS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    // Batch-fetch related reviews and spots
    const reviewIds = [...new Set(docs.map((d) => d.data().reviewId as string))];
    const spotIds = [...new Set(docs.map((d) => d.data().spotId as string))];

    const [reviewDocs, spotDocs] = await Promise.all([
      reviewIds.length > 0
        ? adminDb.getAll(...reviewIds.map((id) => adminDb.collection(COLLECTIONS.REVIEWS).doc(id)))
        : Promise.resolve([]),
      spotIds.length > 0
        ? adminDb.getAll(...spotIds.map((id) => adminDb.collection(COLLECTIONS.SPOTS).doc(id)))
        : Promise.resolve([]),
    ]);

    const reviewMap = new Map(
      reviewDocs
        .filter((d) => d.exists)
        .map((d) => {
          const data = d.data()!;
          return [d.id, { id: d.id, score: data.score, comment: data.comment, userId: data.userId, spotId: data.spotId }];
        })
    );

    const spotMap = new Map(
      spotDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!.name as string])
    );

    const reports: ReportResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        reviewId: data.reviewId,
        spotId: data.spotId,
        reporterUid: data.reporterUid,
        reason: data.reason,
        description: data.description,
        status: data.status,
        resolvedBy: data.resolvedBy,
        resolution: data.resolution,
        createdAt: data.createdAt?.toDate().toISOString() || '',
        updatedAt: data.updatedAt?.toDate().toISOString() || '',
        review: reviewMap.get(data.reviewId),
        spotName: spotMap.get(data.spotId),
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ reports, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
