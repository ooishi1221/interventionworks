import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/spots/merge
 *
 * 2つのスポットをマージ。keepId 側を残し、removeId 側を削除。
 * - goodCount / badReportCount / viewCount を合算
 * - removeId のレビューを keepId に移行
 * - removeId のお気に入りは削除（ローカルDB側は次回起動時にゴースト除去される）
 *
 * Body:
 *   - keepId: string    -- 残すスポットID
 *   - removeId: string  -- 削除するスポットID
 *   - reason?: string   -- マージ理由
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { keepId, removeId, reason } = (await request.json()) as {
      keepId?: string;
      removeId?: string;
      reason?: string;
    };

    if (!keepId || !removeId) {
      return NextResponse.json({ error: 'keepId と removeId は必須です' }, { status: 400 });
    }
    if (keepId === removeId) {
      return NextResponse.json({ error: '同一スポットは指定できません' }, { status: 400 });
    }

    const [keepDoc, removeDoc] = await Promise.all([
      adminDb.collection(COLLECTIONS.SPOTS).doc(keepId).get(),
      adminDb.collection(COLLECTIONS.SPOTS).doc(removeId).get(),
    ]);

    if (!keepDoc.exists) {
      return NextResponse.json({ error: `keepId: ${keepId} が見つかりません` }, { status: 404 });
    }
    if (!removeDoc.exists) {
      return NextResponse.json({ error: `removeId: ${removeId} が見つかりません` }, { status: 404 });
    }

    const keepData = keepDoc.data()!;
    const removeData = removeDoc.data()!;

    // 1) カウント合算
    await adminDb.collection(COLLECTIONS.SPOTS).doc(keepId).update({
      goodCount: (keepData.goodCount || 0) + (removeData.goodCount || 0),
      badReportCount: (keepData.badReportCount || 0) + (removeData.badReportCount || 0),
      viewCount: (keepData.viewCount || 0) + (removeData.viewCount || 0),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2) レビューの spotId を移行
    const reviewsSnap = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('spotId', '==', removeId)
      .get();

    const batch = adminDb.batch();
    let migratedReviews = 0;
    for (const doc of reviewsSnap.docs) {
      batch.update(doc.ref, { spotId: keepId });
      migratedReviews++;
    }

    // 3) 削除対象スポットを削除
    batch.delete(adminDb.collection(COLLECTIONS.SPOTS).doc(removeId));
    await batch.commit();

    // 4) 監査ログ
    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'spot.merge',
      targetType: 'spot',
      targetId: keepId,
      reason: reason || `${removeData.name} を ${keepData.name} にマージ`,
      previousState: {
        removedSpot: { id: removeId, name: removeData.name },
      },
      newState: {
        keepSpot: { id: keepId, name: keepData.name },
        migratedReviews,
        mergedGoodCount: (keepData.goodCount || 0) + (removeData.goodCount || 0),
      },
    });

    return NextResponse.json({
      success: true,
      keepId,
      removedId: removeId,
      migratedReviews,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
