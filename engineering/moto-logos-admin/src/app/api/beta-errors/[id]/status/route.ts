import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type BetaErrorStatus } from '@/lib/types';

const VALID_STATUSES: BetaErrorStatus[] = ['open', 'known', 'in_progress', 'fixed'];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const body = await request.json();

    const newStatus = body.status as BetaErrorStatus;
    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: 'status は open / known / in_progress / fixed のいずれかを指定してください' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection(COLLECTIONS.BETA_ERRORS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'エラーが見つかりません' },
        { status: 404 }
      );
    }

    const previousStatus = doc.data()!.status || 'open';

    await docRef.update({ status: newStatus });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: `beta_error.${newStatus}`,
      targetType: 'beta_error',
      targetId: id,
      previousState: { status: previousStatus },
      newState: { status: newStatus },
    });

    return NextResponse.json({ success: true, newStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
