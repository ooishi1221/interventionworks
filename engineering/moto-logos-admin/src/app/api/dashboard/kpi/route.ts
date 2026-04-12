import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type KpiStats, type UserRank } from '@/lib/types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Firestore Timestamp → Date */
function tsToDate(ts: FirebaseFirestore.Timestamp | undefined): Date | null {
  if (!ts || typeof ts.toDate !== 'function') return null;
  return ts.toDate();
}

/**
 * 日本の住所文字列から市区町村レベルのエリア名を抽出する。
 * 例: "東京都渋谷区神宮前1-2-3" → "東京都渋谷区"
 *     "大阪府大阪市北区梅田" → "大阪府大阪市北区"
 */
function extractArea(address: string | undefined): string {
  if (!address) return '不明';
  // 都道府県 + 市区町村（政令指定都市の場合は区まで）
  const match = address.match(
    /^(.+?[都道府県])(.+?[市])(.+?[区])?/
  );
  if (match) {
    // 政令指定都市: 府 + 市 + 区
    if (match[3]) return `${match[1]}${match[2]}${match[3]}`;
    return `${match[1]}${match[2]}`;
  }
  // 郡・町・村パターン
  const match2 = address.match(/^(.+?[都道府県])(.+?[郡町村区])/);
  if (match2) return `${match2[1]}${match2[2]}`;
  return '不明';
}

export async function GET() {
  try {
    await requireAuth();

    const todayStr = today();
    const yesterdayStr = daysAgo(1);
    const sevenDaysAgoStr = daysAgo(7);
    const thirtyDaysAgoStr = daysAgo(30);

    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // todayの開始と終了（UTC）
    const todayStart = new Date(`${todayStr}T00:00:00Z`);
    const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);

    // ── 並列クエリ ──
    const [
      activitySnap,
      spotsSnap,
      todaySpotsSnap,
      todayValidationsSnap,
      usersSnap,
      moderationSnap,
    ] = await Promise.all([
      // 1. 過去30日間のアクティビティ
      adminDb
        .collection(COLLECTIONS.USER_ACTIVITY)
        .where('date', '>=', thirtyDaysAgoStr)
        .get(),

      // 2. 全スポット（freshness + geographic）
      adminDb.collection(COLLECTIONS.SPOTS).get(),

      // 3. 今日作成されたスポット（postingRate）
      adminDb
        .collection(COLLECTIONS.SPOTS)
        .where('createdAt', '>=', todayStart)
        .where('createdAt', '<=', todayEnd)
        .get(),

      // 4. 今日の投票（verificationRate）
      adminDb
        .collection(COLLECTIONS.VALIDATIONS)
        .where('createdAt', '>=', todayStart)
        .where('createdAt', '<=', todayEnd)
        .get(),

      // 5. 全ユーザー（rankDistribution）
      adminDb.collection(COLLECTIONS.USERS).get(),

      // 6. モデレーションログ: spot.update アクション
      adminDb
        .collection(COLLECTIONS.MODERATION_LOGS)
        .where('action', '==', 'spot.update')
        .get(),
    ]);

    // ─────────────────────────────────────────────────
    // DAU / WAU / MAU + dailyTrend（既存ロジック）
    // ─────────────────────────────────────────────────
    const dailyDevices = new Map<string, Set<string>>();
    const wauDevices = new Set<string>();
    const mauDevices = new Set<string>();

    for (const doc of activitySnap.docs) {
      const { deviceId, date } = doc.data() as { deviceId: string; date: string };
      mauDevices.add(deviceId);
      if (date >= sevenDaysAgoStr) {
        wauDevices.add(deviceId);
      }
      if (!dailyDevices.has(date)) {
        dailyDevices.set(date, new Set());
      }
      dailyDevices.get(date)!.add(deviceId);
    }

    const dau = dailyDevices.get(todayStr)?.size ?? 0;

    const dailyTrend: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i);
      dailyTrend.push({
        date: d,
        count: dailyDevices.get(d)?.size ?? 0,
      });
    }

    // ─────────────────────────────────────────────────
    // 1. Stickiness
    // ─────────────────────────────────────────────────
    const mau = mauDevices.size;
    const stickiness = mau > 0 ? Math.round((dau / mau) * 10000) / 100 : 0;

    // ─────────────────────────────────────────────────
    // 2. Retention (D1 / D7 / D30)
    // ─────────────────────────────────────────────────
    const yesterdayDevices = dailyDevices.get(yesterdayStr) ?? new Set<string>();
    const todayDevicesSet = dailyDevices.get(todayStr) ?? new Set<string>();

    // D1: users active yesterday AND today / users active yesterday
    let d1Retained = 0;
    for (const id of yesterdayDevices) {
      if (todayDevicesSet.has(id)) d1Retained++;
    }
    const d1 = yesterdayDevices.size > 0
      ? Math.round((d1Retained / yesterdayDevices.size) * 10000) / 100
      : 0;

    // D7: users active 7 days ago AND any day since / users active 7 days ago
    const d7DayDevices = dailyDevices.get(sevenDaysAgoStr) ?? new Set<string>();
    let d7Retained = 0;
    for (const id of d7DayDevices) {
      // Check any day from (7 days ago + 1) to today
      for (let i = 6; i >= 0; i--) {
        const daySet = dailyDevices.get(daysAgo(i));
        if (daySet?.has(id)) {
          d7Retained++;
          break;
        }
      }
    }
    const d7 = d7DayDevices.size > 0
      ? Math.round((d7Retained / d7DayDevices.size) * 10000) / 100
      : 0;

    // D30: users active 30 days ago AND any day since / users active 30 days ago
    const d30DayDevices = dailyDevices.get(thirtyDaysAgoStr) ?? new Set<string>();
    let d30Retained = 0;
    for (const id of d30DayDevices) {
      for (let i = 29; i >= 0; i--) {
        const daySet = dailyDevices.get(daysAgo(i));
        if (daySet?.has(id)) {
          d30Retained++;
          break;
        }
      }
    }
    const d30 = d30DayDevices.size > 0
      ? Math.round((d30Retained / d30DayDevices.size) * 10000) / 100
      : 0;

    // ─────────────────────────────────────────────────
    // 3. Posting Rate
    // ─────────────────────────────────────────────────
    const todaySpotsCount = todaySpotsSnap.size;
    const postingRate = dau > 0
      ? Math.round((todaySpotsCount / dau) * 10000) / 100
      : 0;

    // ─────────────────────────────────────────────────
    // 4. Verification Rate
    // ─────────────────────────────────────────────────
    const todayValidationsCount = todayValidationsSnap.size;
    const verificationRate = dau > 0
      ? Math.round((todayValidationsCount / dau) * 10000) / 100
      : 0;

    // ─────────────────────────────────────────────────
    // 5. Freshness Distribution
    // ─────────────────────────────────────────────────
    let fresh = 0;
    let stale = 0;
    let critical = 0;

    // Also collect area data for geographic coverage
    const areaCounts = new Map<string, number>();

    for (const doc of spotsSnap.docs) {
      const data = doc.data();

      // Freshness
      const updatedDate = tsToDate(data.updatedAt);
      if (updatedDate) {
        if (updatedDate >= oneMonthAgo) {
          fresh++;
        } else if (updatedDate >= sixMonthsAgo) {
          stale++;
        } else {
          critical++;
        }
      } else {
        critical++; // No updatedAt means unknown/old
      }

      // Geographic coverage
      const area = extractArea(data.address);
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }

    // ─────────────────────────────────────────────────
    // 6. Rank Distribution
    // ─────────────────────────────────────────────────
    const rankDistribution = { novice: 0, rider: 0, patrol: 0 };
    for (const doc of usersSnap.docs) {
      const rank = doc.data().rank as UserRank | undefined;
      if (rank && rank in rankDistribution) {
        rankDistribution[rank]++;
      } else {
        // Default to novice if rank is missing
        rankDistribution.novice++;
      }
    }

    // ─────────────────────────────────────────────────
    // 7. Moderation Queue Time
    // ─────────────────────────────────────────────────
    let totalDays = 0;
    let resolvedCount = 0;

    for (const doc of moderationSnap.docs) {
      const data = doc.data();
      const prev = data.previousState as Record<string, unknown> | undefined;
      const next = data.newState as Record<string, unknown> | undefined;

      // Only count status transitions (e.g. pending → active or pending → closed)
      if (
        prev?.status === 'pending' &&
        next?.status &&
        next.status !== 'pending'
      ) {
        const createdAt = tsToDate(data.createdAt);
        const prevUpdatedAt = tsToDate(prev.updatedAt as FirebaseFirestore.Timestamp | undefined);

        if (createdAt && prevUpdatedAt) {
          const diffMs = createdAt.getTime() - prevUpdatedAt.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays >= 0) {
            totalDays += diffDays;
            resolvedCount++;
          }
        }
      }
    }

    const moderationAvgDays = resolvedCount > 0
      ? Math.round((totalDays / resolvedCount) * 100) / 100
      : 0;

    // ─────────────────────────────────────────────────
    // 8. Geographic Coverage (Top 10 areas)
    // ─────────────────────────────────────────────────
    const topAreas = Array.from(areaCounts.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ─────────────────────────────────────────────────
    // 9. Review & Photo Rates
    // ─────────────────────────────────────────────────
    const allReviewsSnap = await adminDb.collection(COLLECTIONS.REVIEWS).get();
    const totalReviewCount = allReviewsSnap.size;
    const reviewUserIds = new Set<string>();
    let photoCount = 0;
    for (const d of allReviewsSnap.docs) {
      const data = d.data();
      reviewUserIds.add(data.userId as string);
      const urls = data.photoUrls as string[] | undefined;
      if (urls && urls.length > 0) photoCount++;
    }
    const totalUserCount = (await adminDb.collection(COLLECTIONS.USERS).get()).size || 1;
    const reviewRate = Math.round((reviewUserIds.size / totalUserCount) * 1000) / 10;
    const photoAttachRate = totalReviewCount > 0
      ? Math.round((photoCount / totalReviewCount) * 1000) / 10
      : 0;

    // ─────────────────────────────────────────────────
    // レスポンス構築
    // ─────────────────────────────────────────────────
    const stats: KpiStats = {
      dau,
      wau: wauDevices.size,
      mau,
      dailyTrend,
      stickiness,
      retention: { d1, d7, d30 },
      postingRate,
      verificationRate,
      freshness: { fresh, stale, critical },
      rankDistribution,
      moderationAvgDays,
      topAreas,
      reviewRate,
      photoAttachRate,
      sessionMetrics: null,
    };

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
