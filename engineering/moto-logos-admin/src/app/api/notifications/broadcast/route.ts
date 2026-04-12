import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';

/**
 * POST /api/notifications/broadcast
 *
 * 全ユーザーまたはプラットフォーム別に一斉通知を送信。
 * Expo Push API のバッチ送信（最大100件/リクエスト）を利用。
 *
 * Body:
 *   - title: string
 *   - body: string
 *   - platform?: 'ios' | 'android'  -- 指定時はそのプラットフォームのみ
 *   - data?: Record<string, string>
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const reqBody = await request.json();
    const { title, body, platform, data } = reqBody as {
      title?: string;
      body?: string;
      platform?: 'ios' | 'android';
      data?: Record<string, string>;
    };

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 });
    }

    // 全トークンを取得（プラットフォームフィルタ付き）
    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.PUSH_TOKENS);
    if (platform) {
      query = query.where('platform', '==', platform);
    }
    const snap = await query.get();

    const tokens: string[] = [];
    for (const doc of snap.docs) {
      const token = doc.data().token;
      if (token) tokens.push(token);
    }

    if (tokens.length === 0) {
      return NextResponse.json({ error: '送信対象のトークンがありません' }, { status: 404 });
    }

    // Expo Push API はバッチで最大100件
    const BATCH_SIZE = 100;
    let sentCount = 0;
    let errorCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const messages = batch.map((token) => ({
        to: token,
        title: title.trim(),
        body: body.trim(),
        sound: 'default' as const,
        ...(data && { data }),
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
        errorCount += batch.length;
      }
    }

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'notification.broadcast',
      targetType: 'user',
      targetId: 'all',
      reason: `${title.trim()}: ${body.trim()}`,
      previousState: {},
      newState: {
        title: title.trim(),
        body: body.trim(),
        platform: platform || 'all',
        totalTokens: tokens.length,
        sentCount,
        errorCount,
      },
    });

    return NextResponse.json({
      success: true,
      totalTokens: tokens.length,
      sentCount,
      errorCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
