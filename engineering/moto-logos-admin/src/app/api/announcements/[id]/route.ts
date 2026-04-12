import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

/**
 * PUT  /api/announcements/[id] — お知らせ編集
 * DELETE /api/announcements/[id] — お知らせ削除
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await params;
    const { title, body, sortOrder } = (await request.json()) as {
      title?: string;
      body?: string;
      sortOrder?: number;
    };

    const ref = adminDb.collection('announcements').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const prev = snap.data()!;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (body !== undefined) updates.body = body.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '更新フィールドがありません' }, { status: 400 });
    }

    await ref.update(updates);

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'announcement.update',
      targetType: 'announcement' as never,
      targetId: id,
      reason: (updates.title as string) || prev.title,
      previousState: { title: prev.title, body: prev.body, sortOrder: prev.sortOrder },
      newState: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await params;

    const ref = adminDb.collection('announcements').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const prev = snap.data()!;
    await ref.delete();

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'announcement.delete',
      targetType: 'announcement' as never,
      targetId: id,
      reason: prev.title,
      previousState: { title: prev.title, body: prev.body },
      newState: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
