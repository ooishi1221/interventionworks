import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

const SETTINGS_DOC = 'settings/point_rules';

const DEFAULT_RULES = {
  reviewPost: 1,
  spotRegister: 3,
  photoAttach: 2,
  goodVote: 1,
  badVote: 1,
};

/**
 * GET /api/settings/point-rules
 * 現在のポイント付与ルールを取得
 */
export async function GET() {
  try {
    await requireAuth();
    const doc = await adminDb.doc(SETTINGS_DOC).get();
    return NextResponse.json(doc.exists ? doc.data() : DEFAULT_RULES);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/settings/point-rules
 * ポイント付与ルールを更新
 */
export async function PUT(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const rules = await request.json();

    const prev = await adminDb.doc(SETTINGS_DOC).get();
    const previousState = prev.exists ? prev.data() : DEFAULT_RULES;

    await adminDb.doc(SETTINGS_DOC).set({
      ...rules,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'settings.point_rules',
      targetType: 'settings' as any,
      targetId: 'point_rules',
      reason: 'ポイント付与ルール更新',
      previousState: previousState || {},
      newState: rules,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
