import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/announcements — お知らせ一覧
 * POST /api/announcements — お知らせ作成（アプリ内に表示される）
 */
export async function GET() {
  try {
    await requireAuth();
    const snap = await adminDb
      .collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || '',
    }));

    return NextResponse.json({ announcements: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { title, body } = (await request.json()) as { title?: string; body?: string };

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 });
    }

    const ref = await adminDb.collection('announcements').add({
      title: title.trim(),
      body: body.trim(),
      createdAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'announcement.create',
      targetType: 'announcement' as any,
      targetId: ref.id,
      reason: title.trim(),
      previousState: {},
      newState: { title: title.trim(), body: body.trim() },
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
