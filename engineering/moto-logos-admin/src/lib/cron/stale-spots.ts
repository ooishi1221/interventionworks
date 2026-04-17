import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export interface StaleSpotResult {
  updated: number;
  archived: number;
  message: string;
}

/**
 * 6ヶ月以上更新のないアクティブスポットを pending に変更し、
 * 12ヶ月以上未更新 + goodCount=0 のスポットを closed（アーカイブ）にする。
 */
export async function processStaleSpots(): Promise<StaleSpotResult> {
  const BATCH_LIMIT = 499;

  // ── 6ヶ月前の日時を計算 ──
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // ── 対象スポットを検索: updatedAt < 6ヶ月前 AND status == 'active' ──
  const spotsRef = adminDb.collection(COLLECTIONS.SPOTS);
  const snapshot = await spotsRef
    .where('status', '==', 'active')
    .where('updatedAt', '<', sixMonthsAgo)
    .get();

  let updatedCount = 0;
  const spotIds: string[] = [];

  if (!snapshot.empty) {
    for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
      const chunk = snapshot.docs.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();

      for (const doc of chunk) {
        batch.update(doc.ref, {
          status: 'pending',
          updatedAt: FieldValue.serverTimestamp(),
        });
        spotIds.push(doc.id);
        updatedCount++;
      }

      await batch.commit();
    }

    for (const spotId of spotIds) {
      await writeAuditLog({
        adminId: 'system',
        adminEmail: 'cron@moto-logos.system',
        action: 'spot.auto_pending',
        targetType: 'spot',
        targetId: spotId,
        reason: '6ヶ月以上更新なしのため自動 pending',
        previousState: { status: 'active' },
        newState: { status: 'pending' },
      });
    }
  }

  console.log(`[cron/stale-spots] ${updatedCount}件を pending に変更`);

  // ── 12ヶ月以上未更新 + goodCount=0 のスポットを closed（アーカイブ） ──
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const archiveSnapshot = await spotsRef
    .where('status', 'in', ['active', 'pending'])
    .where('updatedAt', '<', twelveMonthsAgo)
    .get();

  let archivedCount = 0;
  const archiveIds: string[] = [];

  const archiveDocs = archiveSnapshot.docs.filter((d) => (d.data().goodCount || 0) === 0);

  for (let i = 0; i < archiveDocs.length; i += BATCH_LIMIT) {
    const chunk = archiveDocs.slice(i, i + BATCH_LIMIT);
    const batch = adminDb.batch();
    for (const doc of chunk) {
      batch.update(doc.ref, {
        status: 'closed',
        updatedAt: FieldValue.serverTimestamp(),
      });
      archiveIds.push(doc.id);
      archivedCount++;
    }
    await batch.commit();
  }

  for (const id of archiveIds) {
    await writeAuditLog({
      adminId: 'system',
      adminEmail: 'cron@moto-logos.system',
      action: 'spot.auto_archive',
      targetType: 'spot',
      targetId: id,
      reason: '12ヶ月以上更新なし + goodCount=0 のため自動アーカイブ',
      previousState: { status: 'active_or_pending' },
      newState: { status: 'closed' },
    });
  }

  if (archivedCount > 0) {
    console.log(`[cron/stale-spots] ${archivedCount}件を closed（アーカイブ）に変更`);
  }

  return {
    updated: updatedCount,
    archived: archivedCount,
    message: `${updatedCount}件を pending、${archivedCount}件をアーカイブしました`,
  };
}
