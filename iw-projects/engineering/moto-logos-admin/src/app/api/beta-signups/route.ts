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

    // 複合インデックス不要: orderByのみで取得し、フィルタはメモリ内で実行
    const query = adminDb
      .collection(COLLECTIONS.BETA_SIGNUPS)
      .orderBy('createdAt', 'desc')
      .limit(limit * 5);

    const snapshot = await query.get();

    let filtered = snapshot.docs;
    if (status) filtered = filtered.filter((d) => d.data().invitationStatus === status);

    const docs = filtered.slice(0, limit);

    const signups: BetaSignupResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email,
        source: data.source || 'lp',
        os: data.os,
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

    const nextCursor = filtered.length > limit ? docs[docs.length - 1].id : null;

    return NextResponse.json({ signups, nextCursor, totalCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
