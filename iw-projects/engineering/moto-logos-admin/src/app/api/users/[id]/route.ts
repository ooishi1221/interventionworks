import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
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
    if (data.lastActiveAt) response.lastActiveAt = data.lastActiveAt.toDate().toISOString();
    if (typeof data.launchCount === 'number') response.launchCount = data.launchCount;
    if (data.lastPlatform) response.lastPlatform = data.lastPlatform;
    if (data.lastDeviceModel) response.lastDeviceModel = data.lastDeviceModel;
    if (data.lastDeviceBrand) response.lastDeviceBrand = data.lastDeviceBrand;
    if (data.lastOsVersion) response.lastOsVersion = data.lastOsVersion;
    if (data.lastAppVersion) response.lastAppVersion = data.lastAppVersion;
    if (typeof data.spotCount === 'number') response.spotCount = data.spotCount;
    if (typeof data.photoCount === 'number') response.photoCount = data.photoCount;

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

    const allowedFields = ['displayName'];
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

/**
 * ユーザーを完全削除する。
 * - Firestore `users/{id}` ドキュメント削除
 * - Firebase Auth アカウント削除
 * - 関連スポット・レビューは残存（createdBy は残るが匿名扱い）
 * super_admin のみ実行可能
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth('super_admin');
    const { id } = await context.params;
    const url = new URL(request.url);
    const reason = url.searchParams.get('reason') || undefined;

    const docRef = adminDb.collection(COLLECTIONS.USERS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const previousState: Record<string, unknown> = {
      displayName: data.displayName,
      createdAt: data.createdAt?.toDate().toISOString() || null,
    };

    await docRef.delete();

    // Firebase Auth 側のユーザー削除は任意（匿名ユーザーなど uid が Auth に無いケースあり）
    let authDeleted = false;
    try {
      await adminAuth.deleteUser(id);
      authDeleted = true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        throw e;
      }
    }

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      reason,
      previousState,
      newState: { deleted: true, authDeleted },
    });

    return NextResponse.json({ success: true, authDeleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
