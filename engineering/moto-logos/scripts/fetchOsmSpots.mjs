#!/usr/bin/env node
/**
 * OpenStreetMap バイク駐車場データ取得スクリプト
 *
 * Overpass API から首都圏の amenity=motorcycle_parking を取得し、
 * bulkImport.mjs 互換の JSON に変換して出力する。
 *
 * ────────────────────────────────────────────────
 * 使い方:
 *   node scripts/fetchOsmSpots.mjs
 *   → scripts/data/spots-osm-kanto.json が生成される
 *   → node scripts/bulkImport.mjs --file scripts/data/spots-osm-kanto.json で投入
 *
 * オプション:
 *   --dry-run    取得だけして書き出さない（件数確認用）
 *   --bbox S,W,N,E  バウンディングボックスを指定（デフォルト: 首都圏）
 * ────────────────────────────────────────────────
 *
 * ライセンス: OSM データは ODbL。アプリ内に
 *   "© OpenStreetMap contributors" のクレジット表記が必要。
 *   https://www.openstreetmap.org/copyright
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

// ─── 設定 ────────────────────────────────────────────────
// 首都圏バウンディングボックス（南緯, 西経, 北緯, 東経）
// 東京・神奈川・埼玉・千葉 + 茨城南部・栃木南部・群馬南部・山梨・静岡東部
const DEFAULT_BBOX = '34.8,138.5,36.9,140.9';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ─── 引数パース ──────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const bboxIdx = args.indexOf('--bbox');
const bbox = bboxIdx >= 0 ? args[bboxIdx + 1] : DEFAULT_BBOX;
const [south, west, north, east] = bbox.split(',').map(Number);

console.log('=== OpenStreetMap バイク駐車場データ取得 ===\n');
console.log(`対象エリア: ${south},${west} → ${north},${east}`);
console.log(`モード: ${isDryRun ? 'DRY RUN（確認のみ）' : '取得 → JSON出力'}\n`);

// ─── Overpass クエリ ─────────────────────────────────────
// node（点）と way（エリア）の両方を取得し、way は中心座標を算出
const query = `
[out:json][timeout:60];
(
  node["amenity"="motorcycle_parking"](${south},${west},${north},${east});
  way["amenity"="motorcycle_parking"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`;

// ─── Overpass API 呼び出し（リトライ付き） ────────────────
async function fetchOverpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`  → ${endpoint} に問い合わせ中...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!res.ok) {
        console.log(`    ✗ HTTP ${res.status} — 次のエンドポイントへ`);
        continue;
      }

      const data = await res.json();
      return data;
    } catch (err) {
      console.log(`    ✗ ${err.message} — 次のエンドポイントへ`);
    }
  }
  throw new Error('全エンドポイントが応答しませんでした。時間を置いて再試行してください。');
}

// ─── OSM タグ → Moto-Logos フォーマット変換 ──────────────

/**
 * OSM の capacity タグから排気量制限を推定
 * OSM には motorcycle_parking の排気量制限タグの標準がないため、
 * name や description から推定を試みる
 */
function estimateMaxCC(tags) {
  const text = [tags.name, tags.description, tags['note'], tags['motorcycle_parking']].join(' ').toLowerCase();

  if (/原付|50cc|moped/i.test(text)) return 50;
  if (/小型|125cc|原二/i.test(text)) return 125;
  if (/中型|250cc|400cc/i.test(text)) return 250;
  // デフォルト: 制限なし（大型OK）
  return null;
}

/**
 * OSM の fee タグから無料/有料を判定
 */
function parseFee(tags) {
  if (!tags.fee) return null; // 不明
  if (tags.fee === 'no') return true;  // 無料
  if (tags.fee === 'yes') return false; // 有料
  return null; // 不明
}

/**
 * OSM の capacity タグから収容台数を取得
 */
function parseCapacity(tags) {
  const cap = parseInt(tags.capacity, 10);
  return isNaN(cap) ? undefined : cap;
}

/**
 * OSM の opening_hours タグをそのまま転記
 */
function parseOpenHours(tags) {
  return tags.opening_hours || undefined;
}

/**
 * OSM ノード → Moto-Logos スポット
 */
function osmToSpot(element, lat, lon) {
  const tags = element.tags || {};
  const id = `osm_${element.type}_${element.id}`;

  const name = tags.name
    || tags['name:ja']
    || `バイク駐車場（OSM #${element.id}）`;

  const maxCC = estimateMaxCC(tags);
  const isFree = parseFee(tags);
  const capacity = parseCapacity(tags);
  const openHours = parseOpenHours(tags);

  return {
    id,
    name,
    latitude: lat,
    longitude: lon,
    ...(tags['addr:full'] && { address: tags['addr:full'] }),
    ...(tags['addr:street'] && !tags['addr:full'] && {
      address: [tags['addr:city'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(''),
    }),
    maxCC,
    isFree: isFree ?? false,
    ...(capacity != null && { capacity }),
    ...(openHours && { openHours }),
    payment: {
      cash: false,
      icCard: false,
      qrCode: false,
    },
    source: 'seed',
    verificationLevel: 'community',
    // OSM メタデータ（参考用。bulkImport では無視される）
    _osmType: element.type,
    _osmId: element.id,
    _osmTags: tags,
  };
}

// ─── 既存スポットとの重複排除 ─────────────────────────────
/**
 * 2つの座標が近い（約50m以内）かどうか
 */
function isNearby(lat1, lon1, lat2, lon2, thresholdMeters = 50) {
  const R = 6371000; // 地球半径(m)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return d < thresholdMeters;
}

function loadExistingSpots() {
  const path = 'scripts/importRealData.mjs';
  if (!existsSync(path)) return [];

  // importRealData.mjs からリアルスポットの座標を抽出
  const content = readFileSync(path, 'utf-8');
  const coords = [];
  const regex = /latitude:\s*([\d.]+),\s*longitude:\s*([\d.]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    coords.push({ lat: parseFloat(match[1]), lon: parseFloat(match[2]) });
  }
  return coords;
}

// ─── メイン ──────────────────────────────────────────────
const startTime = Date.now();

// 1. Overpass API からデータ取得
console.log('Step 1: Overpass API からデータ取得...');
const rawData = await fetchOverpass(query);

// node と way を分離
const nodes = {};
const ways = [];
const parkingNodes = [];

for (const el of rawData.elements) {
  if (el.type === 'node' && el.tags && el.tags.amenity === 'motorcycle_parking') {
    parkingNodes.push(el);
  }
  if (el.type === 'node') {
    nodes[el.id] = el;
  }
  if (el.type === 'way' && el.tags && el.tags.amenity === 'motorcycle_parking') {
    ways.push(el);
  }
}

console.log(`  ノード: ${parkingNodes.length}件, ウェイ: ${ways.length}件`);

// 2. スポットに変換
console.log('\nStep 2: Moto-Logos フォーマットに変換...');
const spots = [];

// ノード → そのまま座標を使用
for (const node of parkingNodes) {
  spots.push(osmToSpot(node, node.lat, node.lon));
}

// ウェイ → 構成ノードの中心座標を算出
for (const way of ways) {
  const wayNodes = (way.nodes || []).map(nid => nodes[nid]).filter(Boolean);
  if (wayNodes.length === 0) continue;

  const avgLat = wayNodes.reduce((s, n) => s + n.lat, 0) / wayNodes.length;
  const avgLon = wayNodes.reduce((s, n) => s + n.lon, 0) / wayNodes.length;
  spots.push(osmToSpot(way, avgLat, avgLon));
}

console.log(`  変換完了: ${spots.length}件`);

// 3. 既存スポットとの重複排除（50m以内は除外）
console.log('\nStep 3: 既存スポットとの重複排除（50m以内）...');
const existing = loadExistingSpots();
console.log(`  既存スポット: ${existing.length}件`);

const deduped = spots.filter(s => {
  return !existing.some(e => isNearby(s.latitude, s.longitude, e.lat, e.lon, 50));
});

const removedCount = spots.length - deduped.length;
console.log(`  重複除外: ${removedCount}件`);
console.log(`  最終件数: ${deduped.length}件`);

// 4. 統計
console.log('\n=== 統計 ===');
const withName = deduped.filter(s => !s.name.startsWith('バイク駐車場（OSM')).length;
const withAddress = deduped.filter(s => s.address).length;
const withCapacity = deduped.filter(s => s.capacity).length;
const free = deduped.filter(s => s.isFree === true).length;
const paid = deduped.filter(s => s.isFree === false).length;

console.log(`  名前あり: ${withName}件 (${(withName / deduped.length * 100).toFixed(0)}%)`);
console.log(`  住所あり: ${withAddress}件 (${(withAddress / deduped.length * 100).toFixed(0)}%)`);
console.log(`  台数あり: ${withCapacity}件 (${(withCapacity / deduped.length * 100).toFixed(0)}%)`);
console.log(`  無料: ${free}件 / 有料: ${paid}件 / 不明: ${deduped.length - free - paid}件`);

// エリア分布（大まかな都道府県推定）
const prefectures = {
  '東京都': 0, '神奈川県': 0, '埼玉県': 0, '千葉県': 0,
  '茨城県': 0, '栃木県': 0, '群馬県': 0, '静岡県': 0,
  '山梨県': 0, '長野県': 0, 'その他': 0,
};

for (const s of deduped) {
  const { latitude: lat, longitude: lon } = s;
  if (lat >= 35.5 && lat <= 35.9 && lon >= 138.9 && lon <= 139.95) prefectures['東京都']++;
  else if (lat >= 35.1 && lat < 35.65 && lon >= 139.0 && lon <= 139.8) prefectures['神奈川県']++;
  else if (lat >= 35.75 && lat <= 36.3 && lon >= 138.9 && lon <= 139.95) prefectures['埼玉県']++;
  else if (lat >= 35.3 && lat <= 36.0 && lon > 139.8 && lon <= 140.9) prefectures['千葉県']++;
  else if (lat > 36.0 && lon >= 139.6 && lon <= 140.9) prefectures['茨城県']++;
  else if (lat > 36.2 && lon >= 139.2 && lon < 139.6) prefectures['栃木県']++;
  else if (lat > 36.2 && lon < 139.2) prefectures['群馬県']++;
  else if (lat < 35.4 && lon < 139.2) prefectures['静岡県']++;
  else if (lat >= 35.3 && lat < 35.8 && lon < 139.0) prefectures['山梨県']++;
  else if (lat >= 35.8 && lon < 138.9) prefectures['長野県']++;
  else prefectures['その他']++;
}

console.log('\n  エリア分布:');
for (const [pref, count] of Object.entries(prefectures).sort((a, b) => b[1] - a[1])) {
  if (count > 0) console.log(`    ${pref}: ${count}件`);
}

// 5. 出力
if (isDryRun) {
  console.log('\n[DRY RUN] JSON 出力をスキップ。');
  if (deduped.length > 0) {
    console.log('\n先頭3件のプレビュー:');
    for (const s of deduped.slice(0, 3)) {
      console.log(`  ${s.id}: ${s.name} (${s.latitude}, ${s.longitude})`);
    }
  }
} else {
  mkdirSync('scripts/data', { recursive: true });
  const outPath = 'scripts/data/spots-osm-kanto.json';

  // _osm メタデータを除外した出力用データ
  const output = deduped.map(s => {
    const { _osmType, _osmId, _osmTags, ...clean } = s;
    return clean;
  });

  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n出力: ${outPath} (${output.length}件)`);
  console.log(`\n次のステップ:`);
  console.log(`  # 確認`);
  console.log(`  node scripts/bulkImport.mjs --file scripts/data/spots-osm-kanto.json --dry-run`);
  console.log(`  # Firestore に投入`);
  console.log(`  node scripts/bulkImport.mjs --file scripts/data/spots-osm-kanto.json`);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n完了 (${elapsed}秒)`);
console.log('\n⚠️  OSM データは ODbL ライセンスです。');
console.log('   アプリ内に "© OpenStreetMap contributors" のクレジット表記を追加してください。');
