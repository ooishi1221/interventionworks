import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth, hasMinimumRole } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * POST /api/dev/reset
 * テストデータの一括削除（super_admin のみ）
 *
 * body: { targets: ('user_spots' | 'reviews' | 'all_spots')[] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth('super_admin');
    const { targets } = await request.json() as { targets: string[] };

    const results: Record<string, number> = {};

    // ユーザー投稿スポット削除
    if (targets.includes('user_spots')) {
      const snap = await adminDb.collection(COLLECTIONS.SPOTS)
        .where('source', '==', 'user')
        .get();
      const batches = chunkDocs(snap.docs, 499);
      for (const chunk of batches) {
        const batch = adminDb.batch();
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
      results.user_spots = snap.size;
    }

    // レビュー全削除
    if (targets.includes('reviews')) {
      const snap = await adminDb.collection(COLLECTIONS.REVIEWS).get();
      const batches = chunkDocs(snap.docs, 499);
      for (const chunk of batches) {
        const batch = adminDb.batch();
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
      results.reviews = snap.size;
    }

    // 全スポット削除（シード含む）
    if (targets.includes('all_spots')) {
      const snap = await adminDb.collection(COLLECTIONS.SPOTS).get();
      const batches = chunkDocs(snap.docs, 499);
      for (const chunk of batches) {
        const batch = adminDb.batch();
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
      results.all_spots = snap.size;
    }

    return NextResponse.json({ success: true, deleted: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function chunkDocs<T>(docs: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < docs.length; i += size) {
    chunks.push(docs.slice(i, i + size));
  }
  return chunks;
}
