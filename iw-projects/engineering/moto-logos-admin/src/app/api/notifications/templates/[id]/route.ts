import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'notification_templates';

/**
 * PATCH /api/notifications/templates/[id]
 * テンプレート更新
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await params;
    const { name, title, body, category } = (await request.json()) as {
      name?: string;
      title?: string;
      body?: string;
      category?: string;
    };

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });
    }

    const prev = snap.data()!;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (name !== undefined) updates.name = name.trim();
    if (title !== undefined) updates.title = title.trim();
    if (body !== undefined) updates.body = body.trim();
    if (category !== undefined) updates.category = category.trim();

    await ref.update(updates);

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification_template.update',
      targetType: 'notification_template' as never,
      targetId: id,
      reason: (updates.name as string) || prev.name,
      previousState: { name: prev.name, title: prev.title, body: prev.body, category: prev.category },
      newState: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/notifications/templates/[id]
 * テンプレート削除
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await params;

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });
    }

    const prev = snap.data()!;
    await ref.delete();

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification_template.delete',
      targetType: 'notification_template' as never,
      targetId: id,
      reason: prev.name,
      previousState: { name: prev.name, title: prev.title, body: prev.body, category: prev.category },
      newState: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
