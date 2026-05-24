import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/spots/duplicates
 *
 * 重複候補スポットを検出。
 * 半径50m以内 + 名称レーベンシュタイン距離 < 3 のペアを返す。
 */

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface SpotForDup {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: string;
  goodCount: number;
  source: string;
}

export async function GET() {
  try {
    await requireAuth();

    const snap = await adminDb.collection(COLLECTIONS.SPOTS).get();
    const spots: SpotForDup[] = snap.docs.map((d) => {
      const data = d.data();
      const coord = data.coordinate;
      return {
        id: d.id,
        name: (data.name as string) || '',
        lat: coord?.latitude ?? 0,
        lon: coord?.longitude ?? 0,
        status: (data.status as string) || 'active',
        goodCount: (data.goodCount as number) || 0,
        source: (data.source as string) || 'seed',
      };
    });

    // O(n^2) — スポット数が数千以下なら問題ない
    const pairs: { spotA: SpotForDup; spotB: SpotForDup; distance: number; nameDist: number }[] = [];

    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i], b = spots[j];
        const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
        if (dist > 50) continue; // 50m 以内のみ

        const nameDist = levenshtein(a.name.toLowerCase(), b.name.toLowerCase());
        if (nameDist >= 3) continue; // 名称が十分異なる場合はスキップ

        pairs.push({ spotA: a, spotB: b, distance: Math.round(dist), nameDist });
      }
    }

    // 距離順にソート
    pairs.sort((a, b) => a.distance - b.distance);

    return NextResponse.json({ duplicates: pairs, total: pairs.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
