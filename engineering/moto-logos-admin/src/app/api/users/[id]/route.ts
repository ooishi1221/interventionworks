import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const doc = await adminDb.collection(COLLECTIONS.USERS).doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const response: Record<string, unknown> = {
      id: doc.id,
      displayName: data.displayName,
      trustScore: data.trustScore,
      rank: data.rank,
      photoUrl: data.photoUrl || null,
      createdAt: data.createdAt?.toDate().toISOString() || '',
      updatedAt: data.updatedAt?.toDate().toISOString() || '',
    };
    if (data.banStatus) response.banStatus = data.banStatus;
    if (data.banReason) response.banReason = data.banReason;
    if (data.bannedAt) response.bannedAt = data.bannedAt.toDate().toISOString();
    if (data.banUntil !== undefined) {
      response.banUntil = data.banUntil?.toDate().toISOString() || null;
    }
    if (data.bannedBy) response.bannedBy = data.bannedBy;

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const updates = await request.json();

    const allowedFields = ['trustScore', 'rank'];
    const filtered: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) filtered[key] = updates[key];
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: '更新するフィールドがありません' }, { status: 400 });
    }

    const docRef = adminDb.collection(COLLECTIONS.USERS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const previousState: Record<string, unknown> = {};
    const data = doc.data()!;
    for (const key of Object.keys(filtered)) {
      previousState[key] = data[key];
    }

    await docRef.update({
      ...filtered,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: 'user.update',
      targetType: 'user',
      targetId: id,
      reason: updates.reason,
      previousState,
      newState: filtered,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
