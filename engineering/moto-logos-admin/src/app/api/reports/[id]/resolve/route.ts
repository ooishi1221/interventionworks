import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

type ResolveAction = 'resolve' | 'dismiss' | 'delete_review';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const body = await request.json();

    const action = body.action as ResolveAction;
    const resolution = body.resolution as string | undefined;

    if (!action || !['resolve', 'dismiss', 'delete_review'].includes(action)) {
      return NextResponse.json(
        { error: 'action は resolve / dismiss / delete_review のいずれかを指定してください' },
        { status: 400 }
      );
    }

    const reportRef = adminDb.collection(COLLECTIONS.REPORTS).doc(id);
    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
      return NextResponse.json({ error: '通報が見つかりません' }, { status: 404 });
    }

    const reportData = reportDoc.data()!;

    if (reportData.status !== 'open') {
      return NextResponse.json({ error: 'この通報は既に処理済みです' }, { status: 400 });
    }

    const newStatus = action === 'dismiss' ? 'dismissed' : 'resolved';

    // If deleting the review, do it first
    if (action === 'delete_review') {
      const reviewRef = adminDb.collection(COLLECTIONS.REVIEWS).doc(reportData.reviewId);
      const reviewDoc = await reviewRef.get();

      if (reviewDoc.exists) {
        await reviewRef.delete();

        await writeAuditLog({
          adminId: user.uid,
          adminEmail: user.email,
          action: 'review.delete',
          targetType: 'review',
          targetId: reportData.reviewId,
          reason: resolution || `通報 ${id} に基づき削除`,
          previousState: { score: reviewDoc.data()!.score, comment: reviewDoc.data()!.comment },
          newState: { deleted: true },
        });
      }
    }

    // Update report status
    await reportRef.update({
      status: newStatus,
      resolvedBy: user.email,
      resolution: resolution || action,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: `report.${action}`,
      targetType: 'review',
      targetId: reportData.reviewId,
      reason: resolution,
      previousState: { status: reportData.status },
      newState: { status: newStatus },
    });

    return NextResponse.json({ success: true, action, newStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
