import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type ModerationLogResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const targetType = searchParams.get('targetType');
    const targetId = searchParams.get('targetId');
    const action = searchParams.get('action');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.MODERATION_LOGS);

    if (targetType) query = query.where('targetType', '==', targetType);
    if (targetId) query = query.where('targetId', '==', targetId);
    if (action) query = query.where('action', '==', action);

    query = query.orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.MODERATION_LOGS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const logs: ModerationLogResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        adminEmail: data.adminEmail,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        previousState: data.previousState || {},
        newState: data.newState || {},
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ logs, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
