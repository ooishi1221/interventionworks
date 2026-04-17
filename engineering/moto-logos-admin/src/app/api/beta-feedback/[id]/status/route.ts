import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type BetaFeedbackStatus } from '@/lib/types';

const VALID_STATUSES: BetaFeedbackStatus[] = ['open', 'in_progress', 'resolved'];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const body = await request.json();

    const newStatus = body.status as BetaFeedbackStatus;
    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: 'status は open / in_progress / resolved のいずれかを指定してください' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection(COLLECTIONS.BETA_FEEDBACK).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: 'フィードバックが見つかりません' },
        { status: 404 }
      );
    }

    const previousStatus = doc.data()!.status || 'open';

    await docRef.update({ status: newStatus });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: `beta_feedback.${newStatus}`,
      targetType: 'beta_feedback',
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
