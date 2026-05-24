import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = await context.params;

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
      bannedBy: data.bannedBy || null,
    };

    if (!data.banStatus || data.banStatus === 'active') {
      return NextResponse.json(
        { error: 'このユーザーはBAN状態ではありません' },
        { status: 400 }
      );
    }

    await docRef.update({
      banStatus: 'active',
      banReason: FieldValue.delete(),
      banUntil: FieldValue.delete(),
      bannedAt: FieldValue.delete(),
      bannedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'user.unban',
      targetType: 'user',
      targetId: id,
      previousState,
      newState: { banStatus: 'active' },
    });

    // 更新後のデータを返す
    const updated = await docRef.get();
    const updatedData = updated.data()!;

    return NextResponse.json({
      id: updated.id,
      displayName: updatedData.displayName,
      banStatus: 'active',
      createdAt: updatedData.createdAt?.toDate().toISOString() || '',
      updatedAt: updatedData.updatedAt?.toDate().toISOString() || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
