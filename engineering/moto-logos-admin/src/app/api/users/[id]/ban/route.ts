import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type BanStatus } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await context.params;
    const body = await request.json();

    const type = body.type as BanStatus;
    const reason = body.reason as string | undefined;
    const durationDays = body.durationDays as number | undefined;

    if (!type || !['suspended', 'banned'].includes(type)) {
      return NextResponse.json(
        { error: 'type は suspended / banned のいずれかを指定してください' },
        { status: 400 }
      );
    }

    if (!reason?.trim()) {
      return NextResponse.json(
        { error: 'BAN理由は必須です' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection(COLLECTIONS.USERS).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const previousState = {
      banStatus: data.banStatus || 'active',
      banReason: data.banReason || null,
      banUntil: data.banUntil?.toDate().toISOString() || null,
    };

    // durationDays が指定されていれば期限付き、なければ永久BAN
    const banUntil = durationDays
      ? Timestamp.fromDate(new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000))
      : null;

    await docRef.update({
      banStatus: type,
      banReason: reason.trim(),
      bannedAt: FieldValue.serverTimestamp(),
      banUntil,
      bannedBy: admin.email,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: `user.${type}`,
      targetType: 'user',
      targetId: id,
      reason: reason.trim(),
      previousState,
      newState: {
        banStatus: type,
        banReason: reason.trim(),
        banUntil: banUntil?.toDate().toISOString() || null,
        bannedBy: admin.email,
      },
    });

    // 更新後のデータを返す
    const updated = await docRef.get();
    const updatedData = updated.data()!;

    return NextResponse.json({
      id: updated.id,
      displayName: updatedData.displayName,
      trustScore: updatedData.trustScore,
      rank: updatedData.rank,
      banStatus: updatedData.banStatus,
      banReason: updatedData.banReason,
      bannedAt: updatedData.bannedAt?.toDate().toISOString() || '',
      banUntil: updatedData.banUntil?.toDate().toISOString() || null,
      createdAt: updatedData.createdAt?.toDate().toISOString() || '',
      updatedAt: updatedData.updatedAt?.toDate().toISOString() || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
