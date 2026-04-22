import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { adminAuth } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type UserResponse, type AdminRole, type BanStatus } from '@/lib/types';

type SortKey = 'createdAt' | 'lastActiveAt' | 'launchCount' | 'spotCount' | 'photoCount';
const SORT_KEYS: SortKey[] = ['createdAt', 'lastActiveAt', 'launchCount', 'spotCount', 'photoCount'];

function mapUser(doc: FirebaseFirestore.QueryDocumentSnapshot): UserResponse {
  const data = doc.data();
  const user: UserResponse = {
    id: doc.id,
    displayName: data.displayName,
    createdAt: data.createdAt?.toDate().toISOString() || '',
    updatedAt: data.updatedAt?.toDate().toISOString() || '',
  };
  if (data.banStatus) user.banStatus = data.banStatus;
  if (data.banReason) user.banReason = data.banReason;
  if (data.bannedAt) user.bannedAt = data.bannedAt.toDate().toISOString();
  if (data.banUntil !== undefined) {
    user.banUntil = data.banUntil?.toDate().toISOString() || null;
  }
  if (data.lastActiveAt) user.lastActiveAt = data.lastActiveAt.toDate().toISOString();
  if (typeof data.launchCount === 'number') user.launchCount = data.launchCount;
  if (data.lastPlatform) user.lastPlatform = data.lastPlatform;
  if (data.lastDeviceModel) user.lastDeviceModel = data.lastDeviceModel;
  if (data.lastDeviceBrand) user.lastDeviceBrand = data.lastDeviceBrand;
  if (data.lastOsVersion) user.lastOsVersion = data.lastOsVersion;
  if (data.lastAppVersion) user.lastAppVersion = data.lastAppVersion;
  if (typeof data.spotCount === 'number') user.spotCount = data.spotCount;
  if (typeof data.photoCount === 'number') user.photoCount = data.photoCount;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';
    const banStatusFilter = searchParams.get('banStatus') as BanStatus | null;
    const sortByParam = searchParams.get('sortBy') as SortKey | null;
    const sortBy: SortKey = sortByParam && SORT_KEYS.includes(sortByParam) ? sortByParam : 'createdAt';
    const order: 'asc' | 'desc' = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    let query: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.USERS)
      .orderBy(sortBy, order);

    // Firestore の where フィルタ（banStatus）。active は未設定ドキュメントも含めるため後段でフィルタ
    if (banStatusFilter && banStatusFilter !== 'active' && ['suspended', 'banned'].includes(banStatusFilter)) {
      query = query.where('banStatus', '==', banStatusFilter);
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

    // banStatus == 'active' のときは未設定ドキュメントも含めたいので別処理
    if (banStatusFilter === 'active') {
      filteredDocs = filteredDocs.filter((doc) => {
        const data = doc.data();
        return !data.banStatus || data.banStatus === 'active';
      });
    }

    if (q) {
      filteredDocs = filteredDocs.filter((doc) => {
        const name = (doc.data().displayName || '').toLowerCase();
        return name.includes(q);
      });
    }

    const hasMore = filteredDocs.length > limit;
    const docs = hasMore ? filteredDocs.slice(0, limit) : filteredDocs;

    const users: UserResponse[] = docs.map(mapUser);

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ users, nextCursor, sortBy, order });
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
