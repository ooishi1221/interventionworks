import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import {
  COLLECTIONS,
  type BetaSignupResponse,
  type InvitationStatus,
} from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as InvitationStatus | null;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    let query: FirebaseFirestore.Query = adminDb.collection(
      COLLECTIONS.BETA_SIGNUPS
    );

    if (status) query = query.where('invitationStatus', '==', status);

    query = query.orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb
        .collection(COLLECTIONS.BETA_SIGNUPS)
        .doc(cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const signups: BetaSignupResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email,
        source: data.source || 'lp',
        invitationStatus: data.invitationStatus || 'pending',
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    // Total count for slot display
    const countSnapshot = await adminDb
      .collection(COLLECTIONS.BETA_SIGNUPS)
      .count()
      .get();
    const totalCount = countSnapshot.data().count;

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ signups, nextCursor, totalCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
