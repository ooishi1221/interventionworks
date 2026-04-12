import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';

/**
 * POST /api/notifications/send
 *
 * 管理者がユーザーに個別プッシュ通知を送信する。
 * Expo Push API (https://exp.host/--/api/v2/push/send) を直接利用。
 *
 * Body:
 *   - userId?: string    -- ユーザーIDで指定（user_activity から deviceId を逆引き）
 *   - deviceId?: string  -- デバイスIDで直接指定
 *   - title: string      -- 通知タイトル
 *   - body: string       -- 通知本文
 *   - data?: Record<string, string>  -- カスタムデータ
 *
 * userId または deviceId のいずれかが必須。
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const reqBody = await request.json();

    const { userId, deviceId, title, body, data } = reqBody as {
      userId?: string;
      deviceId?: string;
      title?: string;
      body?: string;
      data?: Record<string, string>;
    };

    // バリデーション
    if (!title?.trim()) {
      return NextResponse.json(
        { error: '通知タイトルは必須です' },
        { status: 400 }
      );
    }

    if (!body?.trim()) {
      return NextResponse.json(
        { error: '通知本文は必須です' },
        { status: 400 }
      );
    }

    if (!userId && !deviceId) {
      return NextResponse.json(
        { error: 'userId または deviceId のいずれかを指定してください' },
        { status: 400 }
      );
    }

    // push_tokens コレクションからトークンを検索
    let pushToken: string | null = null;
    let resolvedDeviceId = deviceId || null;

    if (deviceId) {
      // deviceId で直接検索
      const tokenDoc = await adminDb
        .collection(COLLECTIONS.PUSH_TOKENS)
        .doc(deviceId)
        .get();

      if (tokenDoc.exists) {
        pushToken = tokenDoc.data()?.token || null;
      }
    }

    if (!pushToken && userId) {
      // userId から deviceId を逆引き（user_activity コレクションで最新のデバイスを取得）
      const activitySnap = await adminDb
        .collection(COLLECTIONS.USER_ACTIVITY)
        .where('deviceId', '!=', null)
        .orderBy('lastActiveAt', 'desc')
        .limit(100)
        .get();

      // userId は Moto-Logos アプリでは deviceId ベースなので、
      // push_tokens コレクション内で userId フィールドがある場合はそれを使う
      // なければ user_activity から該当 deviceId を特定する

      // まず push_tokens で userId フィールドを検索
      const tokenByUser = await adminDb
        .collection(COLLECTIONS.PUSH_TOKENS)
        .where('deviceId', '==', userId)
        .limit(1)
        .get();

      if (!tokenByUser.empty) {
        const tokenData = tokenByUser.docs[0].data();
        pushToken = tokenData.token || null;
        resolvedDeviceId = tokenData.deviceId || userId;
      } else {
        // push_tokens コレクションのドキュメントIDが userId の場合
        const tokenDoc = await adminDb
          .collection(COLLECTIONS.PUSH_TOKENS)
          .doc(userId)
          .get();

        if (tokenDoc.exists) {
          pushToken = tokenDoc.data()?.token || null;
          resolvedDeviceId = userId;
        }
      }
    }

    if (!pushToken) {
      return NextResponse.json(
        { error: '対象ユーザーのプッシュトークンが見つかりません。アプリで通知を許可していない可能性があります。' },
        { status: 404 }
      );
    }

    // Expo Push API で通知を送信
    const expoPushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        title: title.trim(),
        body: body.trim(),
        sound: 'default',
        ...(data && { data }),
      }),
    });

    if (!expoPushResponse.ok) {
      const errorText = await expoPushResponse.text();
      console.error('[notifications/send] Expo Push API error:', errorText);
      return NextResponse.json(
        { error: 'Expo Push API への送信に失敗しました' },
        { status: 502 }
      );
    }

    const pushResult = await expoPushResponse.json();

    // チケットのステータスを確認
    const ticket = pushResult.data?.[0] || pushResult.data || pushResult;
    if (ticket.status === 'error') {
      console.error('[notifications/send] Push ticket error:', ticket.message, ticket.details);
      return NextResponse.json(
        {
          error: `通知の送信に失敗しました: ${ticket.message || 'Unknown error'}`,
          details: ticket.details,
        },
        { status: 502 }
      );
    }

    // 監査ログに記録
    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification.send',
      targetType: 'user',
      targetId: userId || deviceId || 'unknown',
      reason: `${title.trim()}: ${body.trim()}`,
      previousState: {},
      newState: {
        title: title.trim(),
        body: body.trim(),
        pushToken,
        deviceId: resolvedDeviceId,
        ticketId: ticket.id || null,
        ...(data && { data }),
      },
    });

    return NextResponse.json({
      success: true,
      ticketId: ticket.id || null,
      message: '通知を送信しました',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
