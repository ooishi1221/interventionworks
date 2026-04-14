import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/dashboard/heatmap
 *
 * エリア別ユーザー密度。
 * spots コレクションの geohash プレフィクス（4文字 = 約20km四方）ごとに
 * viewCount を合算し、代表座標とともに返す。
 */

// geohash の文字から緯度経度ビットに変換するためのテーブル
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * geohash 文字列をデコードして中心座標 {lat, lng} を返す。
 * 精度は文字数に依存する。4文字の場合は約 +-0.1度。
 */
function decodeGeohash(hash: string): { lat: number; lng: number } {
  let isLon = true;
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;

  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx === -1) continue;

    for (let bit = 4; bit >= 0; bit--) {
      const mask = 1 << bit;
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (idx & mask) {
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (idx & mask) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      isLon = !isLon;
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lng: (lonMin + lonMax) / 2,
  };
}

export async function GET() {
  try {
    await requireAuth();

    const spotsSnap = await adminDb.collection(COLLECTIONS.SPOTS).get();

    // geohash 4文字プレフィクスごとに viewCount を合算
    const areaMap = new Map<string, { viewCount: number; spotCount: number }>();

    for (const doc of spotsSnap.docs) {
      const data = doc.data();
      const geohash = data.geohash as string | undefined;
      if (!geohash || geohash.length < 4) continue;

      const prefix = geohash.slice(0, 4);
      const existing = areaMap.get(prefix) || { viewCount: 0, spotCount: 0 };
      existing.viewCount += (data.viewCount as number) || 0;
      existing.spotCount += 1;
      areaMap.set(prefix, existing);
    }

    // 配列に変換し、viewCount でソート
    const areas = Array.from(areaMap.entries())
      .map(([geohash, { viewCount, spotCount }]) => {
        const { lat, lng } = decodeGeohash(geohash);
        return {
          geohash,
          lat: Math.round(lat * 1000) / 1000,
          lng: Math.round(lng * 1000) / 1000,
          viewCount,
          spotCount,
        };
      })
      .sort((a, b) => b.viewCount - a.viewCount);

    return NextResponse.json({
      areas,
      totalAreas: areas.length,
      totalSpots: spotsSnap.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
