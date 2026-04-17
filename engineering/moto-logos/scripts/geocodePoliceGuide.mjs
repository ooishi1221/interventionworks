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
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'MotoLogos-DataImport/1.0 (ooishi.y@wit-one.co.jp)';

async function geocode(ward, address) {
  // 東京都のwardは区、多摩地域は市町村
  const isWard = ward.endsWith('区');
  const fullAddress = isWard
    ? `東京都${ward}${address}`
    : `東京都${ward}${address}`;

  const params = new URLSearchParams({
    q: fullAddress,
    format: 'json',
    countrycodes: 'jp',
    limit: '1',
    addressdetails: '0',
  });

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    console.error(`  HTTP ${res.status} for "${fullAddress}"`);
    return null;
  }

  const data = await res.json();
  if (data.length === 0) {
    // フォールバック: ward名だけで検索（粗い座標でもないよりマシ）
    const fallbackParams = new URLSearchParams({
      q: `東京都${ward}`,
      format: 'json',
      countrycodes: 'jp',
      limit: '1',
    });
    const fbRes = await fetch(`${NOMINATIM_URL}?${fallbackParams}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      if (fbData.length > 0) {
        return {
          lat: parseFloat(fbData[0].lat),
          lon: parseFloat(fbData[0].lon),
          fallback: true,
        };
      }
    }
    return null;
  }

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    fallback: false,
  };
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

  // レート制限: 1秒待機
  await sleep(1100);

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
