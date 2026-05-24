import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type InvitationStatus } from '@/lib/types';

const VALID_STATUSES: InvitationStatus[] = ['pending', 'invited', 'active'];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const body = await request.json();

    const newStatus = body.status as InvitationStatus;
    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: 'status は pending / invited / active のいずれかを指定してください' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection(COLLECTIONS.BETA_SIGNUPS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '登録が見つかりません' }, { status: 404 });
    }

    const previousStatus = doc.data()!.invitationStatus || 'pending';

    await docRef.update({ invitationStatus: newStatus });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: `beta_signup.${newStatus}`,
      targetType: 'beta_signup',
      targetId: id,
      previousState: { invitationStatus: previousStatus },
      newState: { invitationStatus: newStatus },
    });

    return NextResponse.json({ success: true, newStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
