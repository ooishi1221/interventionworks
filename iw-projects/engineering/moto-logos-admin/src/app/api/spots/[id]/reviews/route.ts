import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const snap = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .where('spotId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const reviews = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        spotId: data.spotId,
        score: data.score,
        comment: data.comment ?? null,
        photoUrls: data.photoUrls ?? [],
        createdAt: data.createdAt?.toDate().toISOString() ?? '',
      };
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
