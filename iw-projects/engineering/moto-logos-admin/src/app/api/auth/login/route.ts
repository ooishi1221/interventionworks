import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { createSessionCookie, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'IDトークンが必要です' }, { status: 400 });
    }

    // IDトークンを検証
    const decoded = await adminAuth.verifyIdToken(idToken);

    // 管理者ロールがあるか確認
    if (!decoded.role) {
      return NextResponse.json(
        { error: '管理者権限がありません' },
        { status: 403 }
      );
    }

    // セッションCookieを作成・設定
    const sessionCookie = await createSessionCookie(idToken);
    await setSessionCookie(sessionCookie);

    return NextResponse.json({
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 401 });
  }
}
