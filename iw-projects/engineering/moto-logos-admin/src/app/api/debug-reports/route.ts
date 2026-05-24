import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import {
  COLLECTIONS,
  type DebugReportResponse,
  type DebugReportRecentError,
} from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query = adminDb
      .collection(COLLECTIONS.DEBUG_REPORTS)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await adminDb
        .collection(COLLECTIONS.DEBUG_REPORTS)
        .doc(cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, limit);

    const reports: DebugReportResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || 'unknown',
        authUid: data.authUid ?? null,
        platform: data.platform || 'unknown',
        osVersion: data.osVersion || 'unknown',
        deviceModel: data.deviceModel || 'unknown',
        deviceBrand: data.deviceBrand || 'unknown',
        appVersion: data.appVersion || 'unknown',
        buildNumber: data.buildNumber ?? null,
        updateId: data.updateId || 'embedded',
        runtimeVersion: data.runtimeVersion || 'unknown',
        channel: data.channel || 'unknown',
        recentErrors: (data.recentErrors || []) as DebugReportRecentError[],
        userNote: data.userNote || undefined,
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor =
      snapshot.docs.length > limit ? docs[docs.length - 1].id : null;

    return NextResponse.json({ reports, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
