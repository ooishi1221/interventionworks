/**
 * Firestore → SQLite キャッシュ同期
 *
 * 戦略: 24h TTL の全件入れ替え。
 * - 全1,300件 x 300bytes = ~400KB なので全件DLでも軽量
 * - 差分同期しない（Firestore 側に updatedAt インデックス不要、削除検知も不要）
 */

import { fetchAllSpots } from './firestoreService';
import {
  writeSpotsToCache,
  readSpotsFromCache,
  getCacheTimestamp,
  getCachedSpotCount,
} from '../db/spotsCache';
import { captureError } from '../utils/sentry';
import type { ParkingPin } from '../types';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Firestore から全件取得して SQLite に保存。
 * @returns 保存件数。失敗時は -1。
 */
export async function downloadAllSpotsToCache(): Promise<number> {
  try {
    const spots = await fetchAllSpots();
    if (spots.length === 0) return 0;
    await writeSpotsToCache(spots);
    return spots.length;
  } catch (e) {
    captureError(e, { context: 'downloadAllSpotsToCache' });
    return -1;
  }
}

/**
 * キャッシュが新鮮（24h以内）なら全件返す。古い or 空なら null。
 */
export async function loadSpotsFromCacheIfFresh(): Promise<ParkingPin[] | null> {
  try {
    const ts = await getCacheTimestamp();
    if (!ts) return null;

    const age = Date.now() - new Date(ts).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;

    const spots = await readSpotsFromCache();
    return spots.length > 0 ? spots : null;
  } catch (e) {
    captureError(e, { context: 'loadSpotsFromCacheIfFresh' });
    return null;
  }
}

/**
 * キャッシュが古ければバックグラウンドで再DL。fire-and-forget 用。
 */
export async function syncSpotsCache(): Promise<void> {
  try {
    const ts = await getCacheTimestamp();
    if (ts) {
      const age = Date.now() - new Date(ts).getTime();
      if (age < CACHE_MAX_AGE_MS) return; // まだ新鮮
    }
    await downloadAllSpotsToCache();
  } catch (e) {
    captureError(e, { context: 'syncSpotsCache' });
  }
}

/**
 * キャッシュにデータがあるか。
 */
export async function hasSpotsCache(): Promise<boolean> {
  try {
    const count = await getCachedSpotCount();
    return count > 0;
  } catch {
    return false;
  }
}
