import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const APPEALS_COLLECTION = 'ban_appeals';

/**
 * GET /api/moderation/appeals
 * BAN解除申請の一覧（pending / approved / rejected）
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') || 'pending';

    const snap = await adminDb
      .collection(APPEALS_COLLECTION)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const appeals = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        displayName: data.displayName || '',
        reason: data.reason || '',
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() || null,
        reviewedBy: data.reviewedBy || null,
        reviewNote: data.reviewNote || null,
      };
    });

    return NextResponse.json({ appeals });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/moderation/appeals
 * アプリからBAN解除申請を送信（認証不要 — BANされたユーザーが送るため）
 */
export async function POST(request: Request) {
  try {
    const { userId, displayName, reason } = (await request.json()) as {
      userId?: string;
      displayName?: string;
      reason?: string;
    };

    if (!userId || !reason?.trim()) {
      return NextResponse.json({ error: 'userId と reason は必須です' }, { status: 400 });
    }

    // 既存の pending 申請がないか確認
    const existing = await adminDb
      .collection(APPEALS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({ error: '既に審査中の申請があります' }, { status: 409 });
    }

    await adminDb.collection(APPEALS_COLLECTION).add({
      userId,
      displayName: displayName || '',
      reason: reason.trim(),
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, message: '申請を受け付けました' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/moderation/appeals
 * 管理者が申請を承認 / 却下
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { appealId, action, note } = (await request.json()) as {
      appealId?: string;
      action?: 'approve' | 'reject';
      note?: string;
    };

    if (!appealId || !action) {
      return NextResponse.json({ error: 'appealId と action は必須です' }, { status: 400 });
    }

    const ref = adminDb.collection(APPEALS_COLLECTION).doc(appealId);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const userId = data.userId as string;

    await ref.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: admin.email,
      reviewNote: note || null,
    });

    // 承認時は BAN 解除
    if (action === 'approve') {
      const userRef = adminDb.collection(COLLECTIONS.USERS).doc(userId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.update({
          banStatus: 'active',
          banReason: FieldValue.delete(),
          bannedAt: FieldValue.delete(),
          banUntil: FieldValue.delete(),
          bannedBy: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: `appeal.${action}`,
      targetType: 'user',
      targetId: userId,
      reason: note || `BAN解除申請を${action === 'approve' ? '承認' : '却下'}`,
      previousState: { appealId, status: 'pending' },
      newState: { status: action === 'approve' ? 'approved' : 'rejected' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
