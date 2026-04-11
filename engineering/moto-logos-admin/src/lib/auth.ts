import { cookies } from 'next/headers';
import { adminAuth } from './firebase-admin';
import type { SessionUser, AdminRole } from './types';

const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRY_MS,
  });
}

export async function verifySession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) return null;

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const role = (decoded.role as AdminRole) || null;

    if (!role) return null;

    return {
      uid: decoded.uid,
      email: decoded.email || '',
      role,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(sessionCookie: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_MS / 1000,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  viewer: 0,
  moderator: 1,
  super_admin: 2,
};

export function hasMinimumRole(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export async function requireAuth(minimumRole?: AdminRole): Promise<SessionUser> {
  const user = await verifySession();

  if (!user) {
    throw new Error('Unauthorized');
  }

  if (minimumRole && !hasMinimumRole(user.role, minimumRole)) {
    throw new Error('Forbidden');
  }

  return user;
}
