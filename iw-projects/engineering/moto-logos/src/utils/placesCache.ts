/**
 * Places 検索結果キャッシュ — API 節約 + 履歴タップで即移動
 *
 * AsyncStorage に最大 50件の { query, placeId, lat, lng, name } を保持。
 * 同じ query で検索された時や、履歴/人気エリアチップをタップした時に
 * Places API を叩かず即座に座標を返す。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'moto_logos_places_cache';
const MAX_ENTRIES = 50;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

export interface CachedPlace {
  query: string; // 検索語 or 選んだ候補の primaryText
  placeId: string;
  latitude: number;
  longitude: number;
  name: string;
  ts: number;
}

async function loadAll(): Promise<CachedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const arr: CachedPlace[] = JSON.parse(raw);
    const now = Date.now();
    return arr.filter((e) => now - e.ts < TTL_MS);
  } catch {
    return [];
  }
}

async function saveAll(entries: CachedPlace[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {
    // 保存失敗は致命的ではない
  }
}

/** query (case-insensitive) で hit する最新エントリを返す */
export async function getCachedPlace(query: string): Promise<CachedPlace | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const all = await loadAll();
  return all.find((e) => e.query.toLowerCase() === q) ?? null;
}

/** 新規エントリを追加。同じ query があれば先頭に更新。 */
export async function cachePlace(entry: Omit<CachedPlace, 'ts'>): Promise<void> {
  const all = await loadAll();
  const filtered = all.filter(
    (e) => e.query.toLowerCase() !== entry.query.toLowerCase(),
  );
  filtered.unshift({ ...entry, ts: Date.now() });
  await saveAll(filtered);
}
