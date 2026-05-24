import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function GET() {
  const user = await verifySession();

  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 });
  }

  return NextResponse.json(user);
}
