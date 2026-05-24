import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/moderation/photos
 *
 * 写真付きレビューの目視確認キュー。
 * status パラメータで絞り込み（pending / approved / rejected）。
 * デフォルトは pending（未レビュー）。
 * count=true を渡すと件数のみ返す。
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') || 'pending';
    const countOnly = searchParams.get('count') === 'true';
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // --- count only mode ---
    if (countOnly) {
      // pending: photoUrls != [] かつ (photoModeration == 'pending' または photoModeration フィールドなし)
      // Firestore では「フィールドなし OR 値が pending」を単一クエリで取れないため、
      // 2クエリで合算する
      const pendingSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .where('photoModeration', '==', 'pending')
        .count()
        .get();

      // photoModeration フィールドが存在しない既存レビューも未審査扱い
      // Firestore では「フィールドが存在しない」クエリが直接できないため、
      // 全写真付きレビュー数から approved + rejected を引く
      const allPhotosSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .count()
        .get();

      const approvedSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .where('photoModeration', '==', 'approved')
        .count()
        .get();

      const rejectedSnap = await adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .where('photoModeration', '==', 'rejected')
        .count()
        .get();

      const total = allPhotosSnap.data().count;
      const approved = approvedSnap.data().count;
      const rejected = rejectedSnap.data().count;
      const pending = total - approved - rejected;

      if (status === 'pending') {
        return NextResponse.json({ count: pending });
      } else if (status === 'approved') {
        return NextResponse.json({ count: approved });
      } else if (status === 'rejected') {
        return NextResponse.json({ count: rejected });
      }
      return NextResponse.json({ count: pending, total, approved, rejected });
    }

    // --- list mode ---
    let query: FirebaseFirestore.Query;

    if (status === 'pending') {
      // pending 写真: photoModeration が 'pending' または未設定のもの
      // まず明示的 pending を取得し、次に未設定を取得して結合
      const pendingQuery = adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .where('photoModeration', '==', 'pending')
        .orderBy('createdAt', 'desc');

      const unsetQuery = adminDb
        .collection(COLLECTIONS.REVIEWS)
        .where('photoUrls', '!=', [])
        .orderBy('createdAt', 'desc');

      // 両方取得して結合（cursor は省略して簡略化）
      const [pendingSnap, allSnap] = await Promise.all([
        pendingQuery.limit(limit).get(),
        unsetQuery.limit(limit * 2).get(), // 余裕をもって取る
      ]);

      // allSnap から approved/rejected を除外（= 未設定のもの）
      const unsetDocs = allSnap.docs.filter(
        (d) => !d.data().photoModeration
      );

      // 結合して重複排除 & createdAt 降順ソート
      const docMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of pendingSnap.docs) docMap.set(d.id, d);
      for (const d of unsetDocs) docMap.set(d.id, d);

      const allDocs = [...docMap.values()]
        .sort((a, b) => {
          const aTime = a.data().createdAt?.toMillis?.() || 0;
          const bTime = b.data().createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        })
        .slice(0, limit);

      return NextResponse.json({
        photos: await resolvePhotoDocs(allDocs),
        nextCursor: allDocs.length >= limit ? allDocs[allDocs.length - 1].id : null,
      });
    }

    // approved / rejected
    query = adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('photoUrls', '!=', [])
      .where('photoModeration', '==', status)
      .orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await adminDb.collection(COLLECTIONS.REVIEWS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.limit(limit + 1).get();
    const hasMore = snap.docs.length > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return NextResponse.json({
      photos: await resolvePhotoDocs(docs),
      nextCursor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/moderation/photos
 *
 * 写真レビューを承認 / 却下する。
 * Body: { reviewId, action: 'approve' | 'reject', reason? }
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { reviewId, action, reason } = (await request.json()) as {
      reviewId?: string;
      action?: 'approve' | 'reject';
      reason?: string;
    };

    if (!reviewId || !action) {
      return NextResponse.json({ error: 'reviewId と action は必須です' }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTIONS.REVIEWS).doc(reviewId);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'レビューが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const previousStatus = data.photoModeration || 'pending';

    if (action === 'approve') {
      await ref.update({
        photoModeration: 'approved',
        photoModeratedAt: FieldValue.serverTimestamp(),
        photoModeratedBy: admin.email,
      });
    } else {
      // reject: 写真URLをクリアして rejected にする
      await ref.update({
        photoModeration: 'rejected',
        photoModeratedAt: FieldValue.serverTimestamp(),
        photoModeratedBy: admin.email,
        photoUrls: [], // 写真を除去
      });
    }

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: `photo.${action}`,
      targetType: 'review',
      targetId: reviewId,
      reason: reason || `写真を${action === 'approve' ? '承認' : '削除'}`,
      previousState: { photoModeration: previousStatus, userId: data.userId },
      newState: { photoModeration: action === 'approve' ? 'approved' : 'rejected' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ─── helpers ────────────────────────────────────────────

async function resolvePhotoDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  // スポット名解決
  const spotIds = [...new Set(docs.map((d) => d.data().spotId as string))];
  const spotNames = new Map<string, string>();
  for (let i = 0; i < spotIds.length; i += 10) {
    const batch = spotIds.slice(i, i + 10);
    for (const sid of batch) {
      const spotDoc = await adminDb.collection(COLLECTIONS.SPOTS).doc(sid).get();
      if (spotDoc.exists) spotNames.set(sid, spotDoc.data()?.name || sid);
    }
  }

  return docs.map((d) => {
    const data = d.data();
    return {
      reviewId: d.id,
      spotId: data.spotId,
      spotName: spotNames.get(data.spotId as string) || data.spotId,
      userId: data.userId,
      photoUrls: data.photoUrls || [],
      score: data.score,
      comment: data.comment || null,
      photoModeration: data.photoModeration || 'pending',
      createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
    };
  });
}
