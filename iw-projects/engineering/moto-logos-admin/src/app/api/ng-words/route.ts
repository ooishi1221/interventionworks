import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { NG_WORDS } from '@/lib/ng-words';

/**
 * GET /api/ng-words
 * 現在の NG ワードリストを返す（moderator 以上）
 */
export async function GET() {
  try {
    await requireAuth('moderator');
    return NextResponse.json({ words: NG_WORDS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/ng-words
 * NG ワードリストを更新する（super_admin のみ）
 *
 * NOTE: 現在は静的リストのため、更新は監査ログの記録のみ行う。
 * 将来的に Firestore に NG ワードリストを保存する場合はここで書き込みを行う。
 */
export async function PUT(request: Request) {
  try {
    const user = await requireAuth('super_admin');
    const body = await request.json();

    if (!Array.isArray(body.words)) {
      return NextResponse.json(
        { error: 'words フィールド（配列）が必要です' },
        { status: 400 },
      );
    }

    const newWords: string[] = body.words.filter(
      (w: unknown) => typeof w === 'string' && w.trim().length > 0,
    );

    // 監査ログに変更を記録
    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: 'ng_words.update',
      targetType: 'admin',
      targetId: 'ng_words',
      reason: body.reason || 'NGワードリスト更新',
      previousState: { count: NG_WORDS.length, words: NG_WORDS },
      newState: { count: newWords.length, words: newWords },
    });

    return NextResponse.json({
      success: true,
      message: 'NGワードリストの更新が記録されました。静的リストの反映にはデプロイが必要です。',
      count: newWords.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
