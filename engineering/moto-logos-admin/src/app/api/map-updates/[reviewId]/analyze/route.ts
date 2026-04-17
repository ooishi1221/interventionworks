import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';
import { analyzeSpotPhoto } from '@/lib/gemini';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/map-updates/[reviewId]/analyze
 *
 * Gemini で写真を解析し、結果をレビューに保存する。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  try {
    const admin = await requireAuth('moderator');
    const { reviewId } = await context.params;

    const ref = adminDb.collection(COLLECTIONS.REVIEWS).doc(reviewId);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'レビューが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const photoUrls = (data.photoUrls as string[]) || [];

    if (photoUrls.length === 0) {
      return NextResponse.json({ error: '写真がありません' }, { status: 400 });
    }

    // Gemini 解析
    const analysis = await analyzeSpotPhoto(photoUrls, data.photoTag as string | undefined);

    // レビューに解析結果を保存
    await ref.update({
      mapUpdateStatus: 'analyzed',
      mapUpdateAnalysis: analysis,
      mapUpdateAnalyzedBy: admin.email,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    console.error('[map-updates/analyze] エラー:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
