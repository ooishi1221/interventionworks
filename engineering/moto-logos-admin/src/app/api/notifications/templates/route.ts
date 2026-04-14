import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'notification_templates';

/**
 * GET /api/notifications/templates
 * テンプレート一覧を取得
 */
export async function GET() {
  try {
    await requireAuth();
    const snap = await adminDb
      .collection(COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const templates = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || '',
        title: data.title || '',
        body: data.body || '',
        category: data.category || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || '',
      };
    });

    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/notifications/templates
 * テンプレート新規作成
 *
 * Body:
 *   - name: string     -- テンプレート名（管理用）
 *   - title: string    -- 通知タイトル
 *   - body: string     -- 通知本文
 *   - category: string -- カテゴリ（例: maintenance, campaign, update）
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { name, title, body, category } = (await request.json()) as {
      name?: string;
      title?: string;
      body?: string;
      category?: string;
    };

    if (!name?.trim() || !title?.trim() || !body?.trim()) {
      return NextResponse.json(
        { error: 'テンプレート名、タイトル、本文は必須です' },
        { status: 400 },
      );
    }

    const ref = await adminDb.collection(COLLECTION).add({
      name: name.trim(),
      title: title.trim(),
      body: body.trim(),
      category: category?.trim() || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification_template.create',
      targetType: 'notification_template' as never,
      targetId: ref.id,
      reason: name.trim(),
      previousState: {},
      newState: { name: name.trim(), title: title.trim(), body: body.trim(), category: category?.trim() || '' },
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
