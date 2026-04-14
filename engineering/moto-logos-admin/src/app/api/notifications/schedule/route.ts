import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'scheduled_notifications';

/**
 * GET /api/notifications/schedule
 * 予約配信一覧を取得
 */
export async function GET() {
  try {
    await requireAuth();
    const snap = await adminDb
      .collection(COLLECTION)
      .orderBy('scheduledAt', 'desc')
      .limit(100)
      .get();

    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        templateId: data.templateId || null,
        title: data.title || '',
        body: data.body || '',
        scheduledAt: data.scheduledAt?.toDate?.()?.toISOString() || '',
        status: data.status || 'pending',
        targetType: data.targetType || 'all',
        targetGeohash: data.targetGeohash || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
        createdBy: data.createdBy || '',
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/notifications/schedule
 * 予約配信を作成
 *
 * Body:
 *   - templateId?: string       -- テンプレートIDで内容を指定（任意）
 *   - title: string             -- 通知タイトル
 *   - body: string              -- 通知本文
 *   - scheduledAt: string       -- 送信予定日時（ISO 8601）
 *   - targetType: 'all'|'segment'
 *   - targetGeohash?: string    -- targetType='segment' 時の geohash プレフィクス
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { templateId, title, body, scheduledAt, targetType, targetGeohash } =
      (await request.json()) as {
        templateId?: string;
        title?: string;
        body?: string;
        scheduledAt?: string;
        targetType?: 'all' | 'segment';
        targetGeohash?: string;
      };

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 });
    }
    if (!scheduledAt) {
      return NextResponse.json({ error: '送信予定日時は必須です' }, { status: 400 });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: '無効な日時形式です' }, { status: 400 });
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: '未来の日時を指定してください' }, { status: 400 });
    }

    const effectiveTargetType = targetType || 'all';
    if (effectiveTargetType === 'segment' && (!targetGeohash || targetGeohash.length < 2 || targetGeohash.length > 6)) {
      return NextResponse.json({ error: 'セグメント配信の場合、geohashプレフィクス（2-6文字）は必須です' }, { status: 400 });
    }

    const ref = await adminDb.collection(COLLECTION).add({
      templateId: templateId || null,
      title: title.trim(),
      body: body.trim(),
      scheduledAt: scheduledDate,
      status: 'pending',
      targetType: effectiveTargetType,
      targetGeohash: effectiveTargetType === 'segment' ? targetGeohash!.trim() : null,
      createdBy: admin.email,
      createdAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'scheduled_notification.create',
      targetType: 'notification' as never,
      targetId: ref.id,
      reason: `${title.trim()} (${scheduledDate.toISOString()})`,
      previousState: {},
      newState: {
        title: title.trim(),
        body: body.trim(),
        scheduledAt: scheduledDate.toISOString(),
        targetType: effectiveTargetType,
        targetGeohash: effectiveTargetType === 'segment' ? targetGeohash : null,
      },
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
