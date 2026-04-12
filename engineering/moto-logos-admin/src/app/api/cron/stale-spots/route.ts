import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/cron/stale-spots
 *
 * Vercel Cron Job: 6ヶ月以上更新のないアクティブスポットを pending に変更する。
 * 毎日 3:00 UTC（12:00 JST）に実行。
 *
 * Authorization ヘッダーで CRON_SECRET を検証し、
 * 外部からの不正呼び出しを防止する。
 */
export async function GET(request: Request) {
  try {
    // ── Cron シークレット検証 ──
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[cron/stale-spots] CRON_SECRET が設定されていません');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 6ヶ月前の日時を計算 ──
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // ── 対象スポットを検索: updatedAt < 6ヶ月前 AND status == 'active' ──
    const spotsRef = adminDb.collection(COLLECTIONS.SPOTS);
    const snapshot = await spotsRef
      .where('status', '==', 'active')
      .where('updatedAt', '<', sixMonthsAgo)
      .get();

    if (snapshot.empty) {
      console.log('[cron/stale-spots] 対象スポットなし');
      return NextResponse.json({ updated: 0, message: '対象スポットなし' });
    }

    // ── バッチ更新（Firestore バッチは 500 件制限） ──
    const BATCH_LIMIT = 499;
    let updatedCount = 0;
    const spotIds: string[] = [];

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

    // ── 監査ログを記録 ──
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

    // goodCount=0 のみアーカイブ（Firestore は複合 where の制約があるためクライアント側フィルタ）
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

    return NextResponse.json({
      updated: updatedCount,
      archived: archivedCount,
      message: `${updatedCount}件を pending、${archivedCount}件をアーカイブしました`,
    });
  } catch (error) {
    console.error('[cron/stale-spots] エラー:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
