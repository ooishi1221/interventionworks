import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import {
  COLLECTIONS,
  type BetaErrorResponse,
  type BetaErrorStatus,
} from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as BetaErrorStatus | null;
    const appVersion = searchParams.get('appVersion');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query: FirebaseFirestore.Query = adminDb.collection(
      COLLECTIONS.BETA_ERRORS
    );

    if (status) query = query.where('status', '==', status);
    if (appVersion) query = query.where('appVersion', '==', appVersion);

    query = query.orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb
        .collection(COLLECTIONS.BETA_ERRORS)
        .doc(cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const errors: BetaErrorResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        message: data.message || '',
        context: data.context || undefined,
        userId: data.userId || undefined,
        deviceModel: data.deviceModel || '',
        os: data.os || '',
        osVersion: data.osVersion || '',
        appVersion: data.appVersion || '',
        stack: data.stack || undefined,
        status: data.status || 'open',
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ errors, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
