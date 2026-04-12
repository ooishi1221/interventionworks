import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/inquiries — お問い合わせ一覧（Admin用）
 */
export async function GET() {
  try {
    await requireAuth();
    const snap = await adminDb
      .collection('inquiries')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || '',
    }));

    return NextResponse.json({ inquiries: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
