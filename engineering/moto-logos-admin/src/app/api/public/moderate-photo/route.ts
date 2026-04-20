/**
 * POST /api/public/moderate-photo
 *
 * アプリ側のワンショット投稿前に Gemini Vision で事前モデレーション。
 * Firebase ID トークンで認証（admin session ではなく一般ユーザー）。
 *
 * Body: { idToken: string, base64: string, mimeType?: string }
 * Returns: { approved: boolean, reason?: string, rationale?: string }
 */
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { moderatePhoto } from '@/lib/gemini';

// 5MB 程度の画像まで許可（base64 オーバーヘッド込み）
const MAX_BASE64_LENGTH = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, base64, mimeType } = body as {
      idToken?: string;
      base64?: string;
      mimeType?: string;
    };

    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 401 });
    }
    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: 'base64 required' }, { status: 400 });
    }
    if (base64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'image too large' }, { status: 413 });
    }

    // Firebase ID トークン検証（認証済みユーザーなら誰でもOK）
    try {
      await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'invalid idToken' }, { status: 401 });
    }

    const result = await moderatePhoto(base64, mimeType || 'image/jpeg');
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message, approved: true }, { status: 500 });
  }
}
