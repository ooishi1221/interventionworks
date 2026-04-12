import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

const BADGES_COLLECTION = 'badge_definitions';

/**
 * GET /api/settings/badges
 * バッジ定義一覧を取得
 */
export async function GET() {
  try {
    await requireAuth();
    const snap = await adminDb.collection(BADGES_COLLECTION).orderBy('sortOrder').get();
    const badges = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ badges });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/settings/badges
 * バッジ定義を追加
 *
 * Body: { name, description, icon, condition, sortOrder }
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const body = await request.json();
    const { name, description, icon, condition, sortOrder } = body as {
      name?: string;
      description?: string;
      icon?: string;
      condition?: string;
      sortOrder?: number;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'バッジ名は必須です' }, { status: 400 });
    }

    const ref = await adminDb.collection(BADGES_COLLECTION).add({
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon || '🏅',
      condition: condition?.trim() || '',
      sortOrder: sortOrder ?? 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'badge.create',
      targetType: 'settings' as any,
      targetId: ref.id,
      reason: `バッジ「${name.trim()}」を作成`,
      previousState: {},
      newState: { name, icon, condition },
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/settings/badges
 * バッジ定義を削除
 *
 * Body: { id }
 */
export async function DELETE(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { id } = (await request.json()) as { id?: string };

    if (!id) {
      return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
    }

    const doc = await adminDb.collection(BADGES_COLLECTION).doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'バッジが見つかりません' }, { status: 404 });
    }

    await adminDb.collection(BADGES_COLLECTION).doc(id).delete();

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'badge.delete',
      targetType: 'settings' as any,
      targetId: id,
      reason: `バッジ「${doc.data()?.name}」を削除`,
      previousState: doc.data() || {},
      newState: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
