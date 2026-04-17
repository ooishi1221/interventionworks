import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import {
  COLLECTIONS,
  type BetaFeedbackResponse,
  type BetaFeedbackStatus,
  type BetaFeedbackType,
} from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as BetaFeedbackStatus | null;
    const feedbackType = searchParams.get('type') as BetaFeedbackType | null;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // 複合インデックス不要: orderByのみで取得し、フィルタはメモリ内で実行
    const query = adminDb
      .collection(COLLECTIONS.BETA_FEEDBACK)
      .orderBy('createdAt', 'desc')
      .limit(limit * 5);

    const snapshot = await query.get();

    let filtered = snapshot.docs;
    if (status) filtered = filtered.filter((d) => (d.data().status || 'open') === status);
    if (feedbackType) filtered = filtered.filter((d) => d.data().feedbackType === feedbackType);

    const docs = filtered.slice(0, limit);

    const feedbacks: BetaFeedbackResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || '',
        message: data.message || '',
        feedbackType: data.feedbackType || 'opinion',
        photoUrl: data.photoUrl || undefined,
        deviceModel: data.deviceModel || '',
        os: data.os || '',
        osVersion: data.osVersion || '',
        appVersion: data.appVersion || '',
        status: data.status || 'open',
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor = filtered.length > limit ? docs[docs.length - 1].id : null;

    return NextResponse.json({ feedbacks, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
