import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type DashboardStats } from '@/lib/types';

export async function GET() {
  try {
    await requireAuth();

    const [spotsCount, usersCount, pendingCount, reviewsCount] = await Promise.all([
      adminDb.collection(COLLECTIONS.SPOTS).count().get(),
      adminDb.collection(COLLECTIONS.USERS).count().get(),
      adminDb.collection(COLLECTIONS.SPOTS).where('status', '==', 'pending').count().get(),
      adminDb.collection(COLLECTIONS.REVIEWS).count().get(),
    ]);

    const stats: DashboardStats = {
      totalSpots: spotsCount.data().count,
      totalUsers: usersCount.data().count,
      pendingSpots: pendingCount.data().count,
      totalReviews: reviewsCount.data().count,
    };

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
