import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { adminAuth } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type UserResponse, type AdminRole, type BanStatus, type UserRank } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';
    const banStatusFilter = searchParams.get('banStatus') as BanStatus | null;
    const rankFilter = searchParams.get('rank') as UserRank | null;

    let query: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.USERS)
      .orderBy('createdAt', 'desc');

    // Firestore の where フィルタ（banStatus, rank）
    if (banStatusFilter && ['active', 'suspended', 'banned'].includes(banStatusFilter)) {
      query = query.where('banStatus', '==', banStatusFilter);
    }
    if (rankFilter && ['novice', 'rider', 'patrol'].includes(rankFilter)) {
      query = query.where('rank', '==', rankFilter);
    }

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.USERS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // displayName の部分一致検索は Firestore ではネイティブ対応外のため、
    // 多めに取得してアプリ側でフィルタする
    const fetchLimit = q ? (limit + 1) * 5 : limit + 1;
    const snapshot = await query.limit(fetchLimit).get();

    let filteredDocs = snapshot.docs;

    // displayName の部分一致フィルタ（クエリ q がある場合）
    if (q) {
      filteredDocs = filteredDocs.filter((doc) => {
        const name = (doc.data().displayName || '').toLowerCase();
        return name.includes(q);
      });
    }

    // banStatus フィルタが 'active' の場合、banStatus フィールドが存在しないドキュメントも含める
    // （banStatus 未設定 = active とみなす）
    if (banStatusFilter === 'active') {
      // Firestore の where で banStatus == 'active' としたが、
      // 未設定ドキュメントは除外されるため、再度フィルタなしで取得
      const allQuery = adminDb
        .collection(COLLECTIONS.USERS)
        .orderBy('createdAt', 'desc');
      const rankQuery = rankFilter
        ? allQuery.where('rank', '==', rankFilter)
        : allQuery;

      let activeQuery = rankQuery;
      if (cursor) {
        const cursorDoc = await adminDb.collection(COLLECTIONS.USERS).doc(cursor).get();
        if (cursorDoc.exists) {
          activeQuery = activeQuery.startAfter(cursorDoc);
        }
      }

      const allSnapshot = await activeQuery.limit(fetchLimit).get();
      filteredDocs = allSnapshot.docs.filter((doc) => {
        const data = doc.data();
        const isActive = !data.banStatus || data.banStatus === 'active';
        if (!isActive) return false;
        if (q) {
          const name = (data.displayName || '').toLowerCase();
          return name.includes(q);
        }
        return true;
      });
    }

    const hasMore = filteredDocs.length > limit;
    const docs = hasMore ? filteredDocs.slice(0, limit) : filteredDocs;

    const users: UserResponse[] = docs.map((doc) => {
      const data = doc.data();
      const user: UserResponse = {
        id: doc.id,
        displayName: data.displayName,
        trustScore: data.trustScore,
        rank: data.rank,
        createdAt: data.createdAt?.toDate().toISOString() || '',
        updatedAt: data.updatedAt?.toDate().toISOString() || '',
      };
      if (data.banStatus) user.banStatus = data.banStatus;
      if (data.banReason) user.banReason = data.banReason;
      if (data.bannedAt) user.bannedAt = data.bannedAt.toDate().toISOString();
      if (data.banUntil !== undefined) {
        user.banUntil = data.banUntil?.toDate().toISOString() || null;
      }
      return user;
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
