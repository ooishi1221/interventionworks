import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

/** スポットに適用可能なフィールド */
const ALLOWED_FIELDS = new Set([
  'priceInfo',
  'openHours',
  'parkingCapacity',
  'isFree',
  'payment',
  'capacity',
]);

/**
 * POST /api/map-updates/[reviewId]/apply
 *
 * 解析結果の選択フィールドをスポットに適用する。
 * Body: { fields: { priceInfo?: string, openHours?: string, ... } }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { reviewId } = await context.params;
    const body = await request.json();
    const fields = body.fields as Record<string, unknown> | undefined;

    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: '適用するフィールドを指定してください' }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTIONS.REVIEWS).doc(reviewId);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'レビューが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;

    if (data.mapUpdateStatus !== 'analyzed') {
      return NextResponse.json({ error: 'AI解析が完了していないレビューです' }, { status: 400 });
    }

    const spotId = data.spotId as string;
    const spotRef = adminDb.collection(COLLECTIONS.SPOTS).doc(spotId);
    const spotDoc = await spotRef.get();

    if (!spotDoc.exists) {
      return NextResponse.json({ error: 'スポットが見つかりません' }, { status: 404 });
    }

    // 許可されたフィールドのみ抽出
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.has(key) && value !== undefined) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '適用可能なフィールドがありません' }, { status: 400 });
    }

    // スポット更新
    updateData.updatedAt = FieldValue.serverTimestamp();
    updateData.lastVerifiedAt = FieldValue.serverTimestamp();

    const previousState: Record<string, unknown> = {};
    const spotData = spotDoc.data()!;
    for (const key of Object.keys(updateData)) {
      if (key !== 'updatedAt' && key !== 'lastVerifiedAt') {
        previousState[key] = spotData[key] ?? null;
      }
    }

    await spotRef.update(updateData);

    // レビューのステータス更新
    await ref.update({
      mapUpdateStatus: 'applied',
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 監査ログ
    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'spot.map_update_apply',
      targetType: 'spot',
      targetId: spotId,
      reason: `写真レビュー(${reviewId})からAI解析結果を適用`,
      previousState,
      newState: updateData,
    });

    return NextResponse.json({ success: true, updatedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt' && k !== 'lastVerifiedAt') });
  } catch (error) {
    console.error('[map-updates/apply] エラー:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
