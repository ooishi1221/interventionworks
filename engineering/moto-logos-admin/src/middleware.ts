import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公開パスはスキップ
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // API ルート以外で静的リソースはスキップ
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // セッションCookieの有無を確認（サーバーサイドでの詳細検証は各APIで行う）
  const session = request.cookies.get('__session');
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
