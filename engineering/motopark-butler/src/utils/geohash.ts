/**
 * Geohash ユーティリティ — 外部依存ゼロ
 *
 * Firestore の文字列プレフィクスクエリ (>=, <) で
 * 地図の可視範囲だけを効率的にフェッチするための道具。
 *
 * 精度テーブル:
 *   length | lat err   | lon err   | おおよそ
 *   -------|-----------|-----------|----------
 *        4 | ±0.35°    | ±0.35°    | ~40km
 *        5 | ±0.044°   | ±0.044°   | ~5km
 *        6 | ±0.0055°  | ±0.011°   | ~1km
 *        7 | ±0.00069° | ±0.0014°  | ~150m
 *        9 | ±0.000011°|           | ~2m
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** 緯度経度 → geohash 文字列 (デフォルト precision=9) */
export function encodeGeohash(
  latitude: number,
  longitude: number,
  precision = 9
): string {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let hash = '';
  let bit = 0;
  let idx = 0;
  let isLon = true;

  while (hash.length < precision) {
    if (isLon) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude >= mid) { idx = idx * 2 + 1; lonMin = mid; }
      else                  { idx = idx * 2;     lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) { idx = idx * 2 + 1; latMin = mid; }
      else                 { idx = idx * 2;     latMax = mid; }
    }
    isLon = !isLon;
    bit++;
    if (bit === 5) {
      hash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

/** geohash → {lat, lon} の中心点（デコード） */
export function decodeGeohash(hash: string): { latitude: number; longitude: number } {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isLon = true;

  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    for (let bit = 4; bit >= 0; bit--) {
      const mask = 1 << bit;
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (idx & mask) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (idx & mask) latMin = mid; else latMax = mid;
      }
      isLon = !isLon;
    }
  }
  return {
    latitude:  (latMin + latMax) / 2,
    longitude: (lonMin + lonMax) / 2,
  };
}

/**
 * MapView の可視範囲から Firestore クエリ用の
 * geohash プレフィクスの [start, end) ペア配列を返す。
 *
 * 仕組み:
 *   1. 可視範囲の4隅 + 中心の geohash を取る
 *   2. 共通プレフィクス長を算出（短すぎないようクランプ）
 *   3. 重複を排除してプレフィクス群を返す
 *   4. 各プレフィクスに対して [prefix, prefix+"~") の範囲を返す
 */
export function geohashQueryBounds(
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }
): Array<[string, string]> {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  // ズームレベルに応じた適切な精度を決定
  const maxDelta = Math.max(latitudeDelta, longitudeDelta);
  let precision: number;
  if (maxDelta > 1.0)        precision = 2;  // 国レベル
  else if (maxDelta > 0.2)   precision = 3;  // 都道府県レベル
  else if (maxDelta > 0.05)  precision = 4;  // 市区町村レベル
  else if (maxDelta > 0.01)  precision = 5;  // 駅周辺レベル
  else if (maxDelta > 0.002) precision = 6;  // 近隣レベル
  else                       precision = 7;  // 超接近

  // 4隅 + 中心のジオハッシュ
  const corners = [
    encodeGeohash(latitude, longitude, precision),                                          // 中心
    encodeGeohash(latitude + latitudeDelta / 2, longitude - longitudeDelta / 2, precision),  // NW
    encodeGeohash(latitude + latitudeDelta / 2, longitude + longitudeDelta / 2, precision),  // NE
    encodeGeohash(latitude - latitudeDelta / 2, longitude - longitudeDelta / 2, precision),  // SW
    encodeGeohash(latitude - latitudeDelta / 2, longitude + longitudeDelta / 2, precision),  // SE
  ];

  // 一意プレフィクスのセット
  const prefixes = [...new Set(corners)];

  // 各プレフィクスに対して [start, end) ペアを生成
  // "~" は base32 の最後 ('z') より大きい ASCII なので上限として使える
  return prefixes.map((p) => [p, p + '~'] as [string, string]);
}
