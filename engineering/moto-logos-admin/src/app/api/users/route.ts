import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { adminAuth } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type UserResponse, type AdminRole } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.USERS)
      .orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.USERS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const users: UserResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: data.displayName,
        trustScore: data.trustScore,
        rank: data.rank,
        createdAt: data.createdAt?.toDate().toISOString() || '',
        updatedAt: data.updatedAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ users, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAuth('super_admin');
    const { email, password, role } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'メール、パスワード、ロールは必須です' }, { status: 400 });
    }

    const validRoles: AdminRole[] = ['super_admin', 'moderator', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: '無効なロールです' }, { status: 400 });
    }

    const newUser = await adminAuth.createUser({ email, password });
    await adminAuth.setCustomUserClaims(newUser.uid, { role });

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'admin.create',
      targetType: 'admin',
      targetId: newUser.uid,
      previousState: {},
      newState: { email, role },
    });

    return NextResponse.json({ uid: newUser.uid, email, role });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
