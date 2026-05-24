import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';

/**
 * POST /api/notifications/verify-spot
 *
 * 鮮度が古いスポットの確認依頼を関連ユーザーに送信。
 * スポットにレビュー・投票したユーザーのトークンに通知。
 *
 * Body:
 *   - spotId: string  -- 対象スポットID
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { spotId } = (await request.json()) as { spotId?: string };

    if (!spotId) {
      return NextResponse.json({ error: 'spotId は必須です' }, { status: 400 });
    }

    // スポット情報を取得
    const spotDoc = await adminDb.collection(COLLECTIONS.SPOTS).doc(spotId).get();
    if (!spotDoc.exists) {
      return NextResponse.json({ error: 'スポットが見つかりません' }, { status: 404 });
    }
    const spotName = spotDoc.data()?.name || spotId;

    // スポットに関連するユーザーを収集（レビュー投稿者 + スポット作成者）
    const userIds = new Set<string>();
    const createdBy = spotDoc.data()?.createdBy;
    if (createdBy) userIds.add(createdBy);

    const reviewsSnap = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('spotId', '==', spotId)
      .get();
    for (const d of reviewsSnap.docs) {
      const uid = d.data().userId;
      if (uid) userIds.add(uid);
    }

    if (userIds.size === 0) {
      return NextResponse.json({ error: '関連ユーザーが見つかりません' }, { status: 404 });
    }

    // push_tokens を取得
    const tokens: string[] = [];
    const userIdArray = [...userIds];
    for (let i = 0; i < userIdArray.length; i += 10) {
      const batch = userIdArray.slice(i, i + 10);
      const tokenSnap = await adminDb
        .collection(COLLECTIONS.PUSH_TOKENS)
        .where('deviceId', 'in', batch)
        .get();
      for (const d of tokenSnap.docs) {
        const token = d.data().token;
        if (token) tokens.push(token);
      }
    }

    if (tokens.length === 0) {
      return NextResponse.json({ error: '送信対象のトークンがありません' }, { status: 404 });
    }

    // 通知送信
    const messages = tokens.map((token) => ({
      to: token,
      title: '駐輪場の確認依頼',
      body: `「${spotName}」はまだ利用できますか？ 最新情報を共有してください`,
      sound: 'default' as const,
      data: { type: 'verify_spot', spotId },
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    let sentCount = 0;
    let errorCount = 0;
    if (res.ok) {
      const result = await res.json();
      const tickets = result.data || [];
      sentCount = tickets.filter((t: { status: string }) => t.status === 'ok').length;
      errorCount = tickets.filter((t: { status: string }) => t.status === 'error').length;
    } else {
      errorCount = tokens.length;
    }

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification.verify_spot',
      targetType: 'spot',
      targetId: spotId,
      reason: `「${spotName}」の確認依頼を送信`,
      previousState: {},
      newState: { spotName, uniqueUsers: userIds.size, sentCount, errorCount },
    });

    return NextResponse.json({ success: true, spotName, sentCount, errorCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
