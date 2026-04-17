#!/usr/bin/env node
/**
 * 警察ガイドデータのジオコーディング
 *
 * Nominatim (OSM) を使って住所→緯度経度を変換する。
 * レート制限: 1リクエスト/秒（Nominatim利用規約）
 *
 * 使い方:
 *   node scripts/geocodePoliceGuide.mjs
 *   node scripts/geocodePoliceGuide.mjs --dry-run    # API呼び出しなしでプレビュー
 *   node scripts/geocodePoliceGuide.mjs --resume      # 前回の途中から再開
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isResume = args.includes('--resume');

const INPUT = 'scripts/data/police-guide.json';
const OUTPUT = 'scripts/data/police-guide-geocoded.json';

// ─── データ読み込み ─────────────────────────────────
const spots = JSON.parse(readFileSync(INPUT, 'utf-8'));
console.log(`読み込み: ${spots.length} 件\n`);

// Resume: 前回の結果があれば読み込む
let existing = new Map();
if (isResume && existsSync(OUTPUT)) {
  const prev = JSON.parse(readFileSync(OUTPUT, 'utf-8'));
  for (const s of prev) {
    if (s.latitude && s.longitude) {
      existing.set(s.no, s);
    }
  }
  console.log(`前回結果: ${existing.size} 件のジオコード済みデータを再利用\n`);
}

// ─── Nominatim ジオコーディング ──────────────────────
// 国土地理院 ジオコーディングAPI（無料、日本住所に最適）
const GSI_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

async function geocode(ward, address) {
  // 住所の前処理: 括弧内の補足情報を除去
  const cleanAddr = address.replace(/[\(（].*?[\)）]/g, '').trim();
  const fullAddress = `東京都${ward}${cleanAddr}`;

  // Step 1: フルアドレスで検索
  const result = await gsiSearch(fullAddress);
  if (result) return { ...result, fallback: false };

  // Step 2: 番号を除去して再検索（「2丁目23番16号」→「2丁目」）
  const simpleAddr = cleanAddr.replace(/\d+番.*$/, '').trim();
  if (simpleAddr !== cleanAddr) {
    const result2 = await gsiSearch(`東京都${ward}${simpleAddr}`);
    if (result2) return { ...result2, fallback: false };
  }

  // Step 3: ward名だけで検索（粗い座標、フォールバック）
  const result3 = await gsiSearch(`東京都${ward}`);
  if (result3) return { ...result3, fallback: true };

  return null;
}

async function gsiSearch(query) {
  const params = new URLSearchParams({ q: query });
  try {
    const res = await fetch(`${GSI_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    const [lon, lat] = data[0].geometry.coordinates;
    return { lat, lon };
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── メイン処理 ──────────────────────────────────────
if (isDryRun) {
  console.log('[DRY RUN] API呼び出しなし\n');
  const sample = spots.slice(0, 5);
  for (const s of sample) {
    const isWard = s.ward.endsWith('区');
    const full = `東京都${s.ward}${s.address}`;
    console.log(`  #${s.no} ${s.name} → "${full}"`);
  }
  console.log(`\n合計 ${spots.length} 件をジオコードします。`);
  console.log(`推定時間: ${Math.ceil(spots.length / 60)} 分（1req/秒）`);
  process.exit(0);
}

const results = [];
let success = 0;
let fallbackCount = 0;
let failed = 0;
const startTime = Date.now();

for (let i = 0; i < spots.length; i++) {
  const s = spots[i];

  // Resume: 既にジオコード済みならスキップ
  if (existing.has(s.no)) {
    const prev = existing.get(s.no);
    results.push(prev);
    success++;
    if (prev.geocodeFallback) fallbackCount++;
    process.stdout.write(`\r  処理中... ${i + 1}/${spots.length} (cached #${s.no})`);
    continue;
  }

  const result = await geocode(s.ward, s.address);

  if (result) {
    results.push({
      ...s,
      latitude: result.lat,
      longitude: result.lon,
      geocodeFallback: result.fallback,
    });
    success++;
    if (result.fallback) fallbackCount++;
  } else {
    results.push({ ...s, latitude: null, longitude: null, geocodeFallback: null });
    failed++;
    console.log(`\n  ✗ #${s.no} ${s.name} (${s.ward}${s.address}) — ジオコード失敗`);
  }

  process.stdout.write(
    `\r  処理中... ${i + 1}/${spots.length} ` +
    `(成功: ${success}, フォールバック: ${fallbackCount}, 失敗: ${failed})`
  );

  // レート制限: 国土地理院は緩めだが礼儀として300ms待機
  await sleep(300);

  // 100件ごとに中間保存（クラッシュ対策）
  if ((i + 1) % 100 === 0) {
    writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n  [中間保存] ${results.length} 件`);
  }
}

// ─── 結果保存 ─────────────────────────────────────────
writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf-8');

const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log(`\n\n=== ジオコーディング完了 ===`);
console.log(`成功: ${success} 件 (うちフォールバック: ${fallbackCount} 件)`);
console.log(`失敗: ${failed} 件`);
console.log(`成功率: ${((success / spots.length) * 100).toFixed(1)}%`);
console.log(`所要時間: ${elapsed} 分`);
console.log(`出力: ${OUTPUT}`);
