import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type SpotResponse, type SpotStatus, type VerificationLevel } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as SpotStatus | null;
    const verification = searchParams.get('verification') as VerificationLevel | null;
    const source = searchParams.get('source') as 'seed' | 'user' | null;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.SPOTS);

    if (status) query = query.where('status', '==', status);
    if (verification) query = query.where('verificationLevel', '==', verification);
    if (source) query = query.where('source', '==', source);

    query = query.orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.SPOTS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const spots: SpotResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        address: data.address,
        status: data.status,
        verificationLevel: data.verificationLevel,
        source: data.source,
        goodCount: data.goodCount,
        badReportCount: data.badReportCount,
        viewCount: data.viewCount,
        isFree: data.isFree,
        pricePerHour: data.pricePerHour,
        updatedAt: data.updatedAt?.toDate().toISOString() || '',
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ spots, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
