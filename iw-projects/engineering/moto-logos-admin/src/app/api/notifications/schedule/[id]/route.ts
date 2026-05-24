import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

const COLLECTION = 'scheduled_notifications';

/**
 * PATCH /api/notifications/schedule/[id]
 * 予約配信のキャンセル（status を 'cancelled' に変更）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await params;
    const { status } = (await request.json()) as { status?: string };

    if (status !== 'cancelled') {
      return NextResponse.json({ error: 'status は "cancelled" のみ指定できます' }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: '予約配信が見つかりません' }, { status: 404 });
    }

    const prev = snap.data()!;
    if (prev.status !== 'pending') {
      return NextResponse.json(
        { error: `現在のステータスが "${prev.status}" のため、キャンセルできません` },
        { status: 400 },
      );
    }

    await ref.update({ status: 'cancelled' });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'scheduled_notification.cancel',
      targetType: 'notification' as never,
      targetId: id,
      reason: prev.title,
      previousState: { status: prev.status },
      newState: { status: 'cancelled' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/notifications/schedule/[id]
 * 予約配信を削除
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
      return NextResponse.json({ error: '予約配信が見つかりません' }, { status: 404 });
    }

    const prev = snap.data()!;
    await ref.delete();

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'scheduled_notification.delete',
      targetType: 'notification' as never,
      targetId: id,
      reason: prev.title,
      previousState: { title: prev.title, body: prev.body, status: prev.status },
      newState: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
