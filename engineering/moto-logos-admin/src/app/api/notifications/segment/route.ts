import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';

/**
 * POST /api/notifications/segment
 *
 * エリア別セグメント通知。geohash プレフィクスでスポット投稿者を絞り込み通知。
 *
 * Body:
 *   - title: string
 *   - body: string
 *   - geohashPrefix: string  -- geohash プレフィクス（2〜6文字）
 *   - data?: Record<string, string>
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const reqBody = await request.json();
    const { title, body, geohashPrefix, data } = reqBody as {
      title?: string;
      body?: string;
      geohashPrefix?: string;
      data?: Record<string, string>;
    };

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 });
    }
    if (!geohashPrefix || geohashPrefix.length < 2 || geohashPrefix.length > 6) {
      return NextResponse.json({ error: 'geohashPrefix は2〜6文字で指定してください' }, { status: 400 });
    }

    // 1) 該当エリアのスポットを投稿したユーザー（createdBy）を収集
    const endPrefix = geohashPrefix.slice(0, -1) +
      String.fromCharCode(geohashPrefix.charCodeAt(geohashPrefix.length - 1) + 1);

    const spotsSnap = await adminDb
      .collection(COLLECTIONS.SPOTS)
      .where('geohash', '>=', geohashPrefix)
      .where('geohash', '<', endPrefix)
      .get();

    // 2) 該当エリアでレビューを書いたユーザーも収集
    const spotIds = spotsSnap.docs.map((d) => d.id);
    const userIds = new Set<string>();

    for (const d of spotsSnap.docs) {
      const createdBy = d.data().createdBy;
      if (createdBy) userIds.add(createdBy);
    }

    // レビューからも userId を収集（spotId でバッチ）
    for (let i = 0; i < spotIds.length; i += 10) {
      const batch = spotIds.slice(i, i + 10);
      const reviewsSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('spotId', 'in', batch)
        .get();
      for (const d of reviewsSnap.docs) {
        const uid = d.data().userId;
        if (uid) userIds.add(uid);
      }
    }

    if (userIds.size === 0) {
      return NextResponse.json({ error: '該当エリアに関連するユーザーが見つかりません' }, { status: 404 });
    }

    // 3) userId（= deviceId）から push_tokens を取得
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

    // 4) Expo Push API バッチ送信
    const BATCH_SIZE = 100;
    let sentCount = 0;
    let errorCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const chunk = tokens.slice(i, i + BATCH_SIZE);
      const messages = chunk.map((token) => ({
        to: token,
        title: title.trim(),
        body: body.trim(),
        sound: 'default' as const,
        ...(data && { data }),
      }));

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification.segment',
      targetType: 'user',
      targetId: `area:${geohashPrefix}`,
      reason: `${title.trim()}: ${body.trim()}`,
      previousState: {},
      newState: {
        geohashPrefix,
        spotsInArea: spotsSnap.size,
        uniqueUsers: userIds.size,
        sentCount,
        errorCount,
      },
    });

    return NextResponse.json({
      success: true,
      spotsInArea: spotsSnap.size,
      uniqueUsers: userIds.size,
      sentCount,
      errorCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
