import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

type ModerationAction = 'approve' | 'reject' | 'delete';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const body = await request.json();

    const action = body.action as ModerationAction;
    const reason = body.reason as string | undefined;

    if (!action || !['approve', 'reject', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: 'action は approve / reject / delete のいずれかを指定してください' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !reason?.trim()) {
      return NextResponse.json(
        { error: '却下には理由が必要です' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection(COLLECTIONS.SPOTS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'スポットが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const previousState = {
      status: data.status,
      verificationLevel: data.verificationLevel,
    };

    if (action === 'delete') {
      await docRef.delete();

      await writeAuditLog({
        adminId: user.uid,
        adminEmail: user.email,
        action: 'spot.delete',
        targetType: 'spot',
        targetId: id,
        reason: reason || undefined,
        previousState,
        newState: { deleted: true },
      });

      return NextResponse.json({ success: true, action: 'delete' });
    }

    const newStatus = action === 'approve' ? 'active' : 'closed';

    await docRef.update({
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: `spot.${action}`,
      targetType: 'spot',
      targetId: id,
      reason: reason || undefined,
      previousState,
      newState: { status: newStatus },
    });

    return NextResponse.json({ success: true, action, newStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
