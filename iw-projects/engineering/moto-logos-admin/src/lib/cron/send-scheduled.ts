import { adminDb } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';

export interface SendScheduledResult {
  processed: number;
  totalSent: number;
  totalErrors: number;
  message: string;
}

/**
 * 送信予定時刻を過ぎた pending の予約配信を実行する。
 */
export async function processSendScheduled(): Promise<SendScheduledResult> {
  const now = new Date();
  const snap = await adminDb
    .collection('scheduled_notifications')
    .where('status', '==', 'pending')
    .where('scheduledAt', '<=', now)
    .get();

  if (snap.empty) {
    console.log('[cron/send-scheduled] 送信対象なし');
    return { processed: 0, totalSent: 0, totalErrors: 0, message: '送信対象なし' };
  }

  let totalSent = 0;
  let totalErrors = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const { title, body, targetType, targetGeohash } = data;

    try {
      let tokens: string[] = [];

      if (targetType === 'segment' && targetGeohash) {
        // ── エリア別: geohash でスポット投稿者・レビュー投稿者を収集 ──
        const endPrefix =
          targetGeohash.slice(0, -1) +
          String.fromCharCode(targetGeohash.charCodeAt(targetGeohash.length - 1) + 1);

        const spotsSnap = await adminDb
          .collection(COLLECTIONS.SPOTS)
          .where('geohash', '>=', targetGeohash)
          .where('geohash', '<', endPrefix)
          .get();

        const userIds = new Set<string>();
        const spotIds: string[] = [];

        for (const s of spotsSnap.docs) {
          const createdBy = s.data().createdBy;
          if (createdBy) userIds.add(createdBy);
          spotIds.push(s.id);
        }

        for (let i = 0; i < spotIds.length; i += 10) {
          const batch = spotIds.slice(i, i + 10);
          const reviewsSnap = await adminDb
            .collection(COLLECTIONS.REVIEWS)
            .where('spotId', 'in', batch)
            .get();
          for (const r of reviewsSnap.docs) {
            const uid = r.data().userId;
            if (uid) userIds.add(uid);
          }
        }

        const userIdArray = [...userIds];
        for (let i = 0; i < userIdArray.length; i += 10) {
          const batch = userIdArray.slice(i, i + 10);
          const tokenSnap = await adminDb
            .collection(COLLECTIONS.PUSH_TOKENS)
            .where('deviceId', 'in', batch)
            .get();
          for (const t of tokenSnap.docs) {
            const token = t.data().token;
            if (token) tokens.push(token);
          }
        }
      } else {
        // ── 全ユーザー ──
        const tokenSnap = await adminDb.collection(COLLECTIONS.PUSH_TOKENS).get();
        for (const t of tokenSnap.docs) {
          const token = t.data().token;
          if (token) tokens.push(token);
        }
      }

      if (tokens.length === 0) {
        await doc.ref.update({ status: 'sent', sentAt: now, sentCount: 0, errorCount: 0 });
        continue;
      }

      // ── Expo Push API バッチ送信 ──
      const BATCH_SIZE = 100;
      let sentCount = 0;
      let errorCount = 0;

      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const chunk = tokens.slice(i, i + BATCH_SIZE);
        const messages = chunk.map((token) => ({
          to: token,
          title: (title || '').trim(),
          body: (body || '').trim(),
          sound: 'default' as const,
        }));

        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });

        if (res.ok) {
          const result = await res.json();
          const tickets = result.data || [];
          sentCount += tickets.filter((t: { status: string }) => t.status === 'ok').length;
          errorCount += tickets.filter((t: { status: string }) => t.status === 'error').length;
        } else {
          errorCount += chunk.length;
        }
      }

      await doc.ref.update({
        status: 'sent',
        sentAt: now,
        sentCount,
        errorCount,
        totalTokens: tokens.length,
      });

      totalSent += sentCount;
      totalErrors += errorCount;

      await writeAuditLog({
        adminId: 'system',
        adminEmail: 'cron@moto-logos.system',
        action: 'scheduled_notification.send',
        targetType: 'notification' as never,
        targetId: doc.id,
        reason: `予約配信実行: ${(title || '').trim()}`,
        previousState: { status: 'pending' },
        newState: {
          status: 'sent',
          targetType,
          totalTokens: tokens.length,
          sentCount,
          errorCount,
        },
      });
    } catch (err) {
      console.error(`[cron/send-scheduled] 配信ID=${doc.id} の送信に失敗:`, err);
      await doc.ref.update({ status: 'sent', sentAt: now, sentCount: 0, errorCount: -1 });
      totalErrors++;
    }
  }

  console.log(`[cron/send-scheduled] ${snap.size}件処理: ${totalSent}件送信 / ${totalErrors}件エラー`);

  return {
    processed: snap.size,
    totalSent,
    totalErrors,
    message: `${snap.size}件の予約配信を処理しました`,
  };
}
