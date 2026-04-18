import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { checkNgWords } from '@/lib/ng-words';
import { COLLECTIONS, type SpotResponse, type SpotStatus, type VerificationLevel } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as SpotStatus | null;
    const verification = searchParams.get('verification') as VerificationLevel | null;
    const source = searchParams.get('source') as 'seed' | 'user' | null;
    const search = searchParams.get('search')?.toLowerCase().trim() || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // 検索時はFirestoreから全件取得してサーバー側フィルタ
    if (search) {
      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.SPOTS);
      if (status) query = query.where('status', '==', status);
      if (source) query = query.where('source', '==', source);

      const snapshot = await query.get();
      let spots: SpotResponse[] = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            address: data.address,
            status: data.status,
            verificationLevel: data.verificationLevel,
            source: data.source,
            goodCount: data.goodCount,
            badReportCount: data.badReportCount,
            viewCount: data.viewCount,
            isFree: data.isFree,
            pricePerHour: data.pricePerHour,
            updatedAt: data.updatedAt?.toDate().toISOString() || '',
            createdAt: data.createdAt?.toDate().toISOString() || '',
          };
        })
        .filter((s) => s.name?.toLowerCase().includes(search) || s.address?.toLowerCase().includes(search));

      // ソート
      spots.sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sortBy] ?? '';
        const vb = (b as unknown as Record<string, unknown>)[sortBy] ?? '';
        const cmp = String(va).localeCompare(String(vb));
        return sortOrder === 'asc' ? cmp : -cmp;
      });

      return NextResponse.json({ spots, nextCursor: null, total: spots.length });
    }

    // 通常のページネーション
    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.SPOTS);

    if (status) query = query.where('status', '==', status);
    if (verification) query = query.where('verificationLevel', '==', verification);
    if (source) query = query.where('source', '==', source);

    query = query.orderBy(sortBy, sortOrder);

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.SPOTS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const spots: SpotResponse[] = docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        address: data.address,
        status: data.status,
        verificationLevel: data.verificationLevel,
        source: data.source,
        goodCount: data.goodCount,
        badReportCount: data.badReportCount,
        viewCount: data.viewCount,
        isFree: data.isFree,
        pricePerHour: data.pricePerHour,
        updatedAt: data.updatedAt?.toDate().toISOString() || '',
        createdAt: data.createdAt?.toDate().toISOString() || '',
      };
    });

    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({ spots, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth('moderator');
    const body = await request.json();

    const { name, latitude, longitude } = body;
    if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'name, latitude, longitude は必須です' },
        { status: 400 },
      );
    }

    // NG ワードチェック
    const ngResult = checkNgWords(name);
    if (ngResult.blocked) {
      return NextResponse.json(
        { error: `スポット名に不適切な表現が含まれています: ${ngResult.matchedWord}` },
        { status: 400 },
      );
    }

    const now = FieldValue.serverTimestamp();
    const docRef = adminDb.collection(COLLECTIONS.SPOTS).doc();

    await docRef.set({
      name,
      coordinate: { latitude, longitude },
      geohash: body.geohash || '',
      address: body.address || '',
      status: body.status || 'pending',
      verificationLevel: body.verificationLevel || 'community',
      source: body.source || 'user',
      isFree: body.isFree ?? true,
      pricePerHour: body.pricePerHour ?? null,
      parkingCapacity: body.parkingCapacity ?? null,
      capacity: body.capacity || { is50only: false, upTo125: true, upTo400: true, isLargeOk: true },
      payment: body.payment || { cash: false, icCard: false, qrCode: false },
      goodCount: 0,
      badReportCount: 0,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: 'spot.create',
      targetType: 'spot',
      targetId: docRef.id,
      reason: body.reason || 'スポット新規作成',
      previousState: {},
      newState: { name, latitude, longitude },
    });

    return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
