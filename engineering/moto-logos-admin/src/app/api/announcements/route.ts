import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/announcements — お知らせ一覧
 * POST /api/announcements — お知らせ作成（アプリ内に表示される）
 */
export async function GET() {
  try {
    await requireAuth();
    const snap = await adminDb
      .collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        sortOrder: data.sortOrder ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
      };
    });

    // sortOrder があるものを優先、なければ createdAt desc
    items.sort((a, b) => {
      const sa = a.sortOrder ?? Infinity;
      const sb = b.sortOrder ?? Infinity;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ announcements: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { title, body } = (await request.json()) as { title?: string; body?: string };

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 });
    }

    // 新規投稿は既存の最大 sortOrder + 1（先頭に表示されないよう末尾に追加）
    const ref = await adminDb.collection('announcements').add({
      title: title.trim(),
      body: body.trim(),
      sortOrder: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'announcement.create',
      targetType: 'announcement' as any,
      targetId: ref.id,
      reason: title.trim(),
      previousState: {},
      newState: { title: title.trim(), body: body.trim() },
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
