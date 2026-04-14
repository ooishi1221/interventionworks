#!/usr/bin/env node
/**
 * 広域一括インポートスクリプト — Moto-Spotter
 *
 * 関東全域 + 静岡・山梨・長野の駐輪場データを
 * Firestore へ geohash 付きでバッチ書き込みする。
 *
 * ────────────────────────────────────────────────
 * 使い方:
 *   1. Firebase Admin SDK のサービスアカウント JSON を取得し
 *      scripts/serviceAccount.json に配置
 *   2. インポートデータを scripts/data/spots.json に配置
 *      （形式は下記の SAMPLE_FORMAT を参照）
 *   3. 実行:
 *      node scripts/bulkImport.mjs
 *
 *      オプション:
 *        --dry-run    書き込みせずに件数だけ表示
 *        --file PATH  デフォルト以外のJSONファイルを指定
 * ────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';

// ─── Geohash エンコーダ（アプリ側と同一ロジック） ─────
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(latitude, longitude, precision = 9) {
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

// ─── MaxCC → capacity オブジェクト ────────────────────
function maxCCToCapacity(maxCC) {
  return {
    is50only:  maxCC === 50,
    upTo125:   maxCC === 125,
    upTo400:   maxCC === 250,
    isLargeOk: maxCC === null || maxCC === undefined,
  };
}

// ─── メイン ──────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const fileIdx = args.indexOf('--file');
const dataPath = fileIdx >= 0 ? args[fileIdx + 1] : 'scripts/data/spots.json';

console.log('=== Moto-Spotter 広域一括インポート ===\n');

// Firebase Admin 初期化
const saPath = 'scripts/serviceAccount.json';
if (!existsSync(saPath)) {
  console.error(`[ERROR] サービスアカウントファイルが見つかりません: ${saPath}`);
  console.error('Firebase Console → プロジェクト設定 → サービスアカウント → 新しい秘密鍵の生成');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf-8'))) });
const db = getFirestore();

// データ読み込み
if (!existsSync(dataPath)) {
  console.error(`[ERROR] データファイルが見つかりません: ${dataPath}`);
  console.log('\n期待するJSON形式:');
  console.log(JSON.stringify(SAMPLE_FORMAT(), null, 2));
  process.exit(1);
}

const rawData = JSON.parse(readFileSync(dataPath, 'utf-8'));
const spots = Array.isArray(rawData) ? rawData : rawData.spots ?? [];
console.log(`読み込み: ${spots.length} 件`);

if (isDryRun) {
  console.log('[DRY RUN] 書き込みをスキップします。');
  // 先頭3件をプレビュー
  for (const s of spots.slice(0, 3)) {
    const gh = encodeGeohash(s.latitude, s.longitude);
    console.log(`  ${s.name} → geohash: ${gh}`);
  }
  console.log(`\n合計 ${spots.length} 件が書き込み対象です。`);
  process.exit(0);
}

// ─── バッチ書き込み（500件ずつ） ─────────────────────
const BATCH_SIZE = 499; // Firestore の 500 オペレーション/バッチ制限
let written = 0;
const startTime = Date.now();

for (let i = 0; i < spots.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const chunk = spots.slice(i, i + BATCH_SIZE);

  for (const s of chunk) {
    const docId = s.id ?? `import_${i + chunk.indexOf(s)}`;
    const ref = db.collection('spots').doc(docId);
    const now = Timestamp.now();

    batch.set(ref, {
      name:              s.name,
      coordinate:        new GeoPoint(s.latitude, s.longitude),
      geohash:           encodeGeohash(s.latitude, s.longitude, 9),
      ...(s.address      && { address: s.address }),
      capacity:          maxCCToCapacity(s.maxCC ?? null),
      ...(s.capacity     != null && { parkingCapacity: s.capacity }),
      payment:           s.payment ?? { cash: true, icCard: false, qrCode: false },
      isFree:            s.isFree ?? false,
      ...(s.pricePerHour != null && { pricePerHour: s.pricePerHour }),
      ...(s.priceInfo    && { priceInfo: s.priceInfo }),
      ...(s.openHours    && { openHours: s.openHours }),
      viewCount:         0,
      goodCount:         0,
      badReportCount:    0,
      status:            'active',
      verificationLevel: s.verificationLevel ?? 'community',
      source:            s.source ?? 'seed',
      updatedAt:         now,
      lastVerifiedAt:    now,
      createdAt:         now,
    });
  }

  await batch.commit();
  written += chunk.length;
  const pct = ((written / spots.length) * 100).toFixed(1);
  process.stdout.write(`\r  書き込み中... ${written}/${spots.length} (${pct}%)`);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n完了: ${written} 件を Firestore に書き込みました (${elapsed}秒)`);

// ─── サンプルフォーマット ────────────────────────────
function SAMPLE_FORMAT() {
  return [
    {
      id:        'kanto_001',
      name:      '渋谷駅前バイク駐輪場',
      latitude:  35.6580,
      longitude: 139.7016,
      address:   '東京都渋谷区道玄坂1-1',
      maxCC:     null,
      isFree:    false,
      capacity:  200,
      pricePerHour: 200,
      openHours: '24時間',
      source:    'seed',
    },
    {
      id:        'kanto_002',
      name:      '横浜駅西口二輪駐輪場',
      latitude:  35.4657,
      longitude: 139.6201,
      address:   '神奈川県横浜市西区南幸1',
      maxCC:     250,
      isFree:    false,
      capacity:  80,
    },
  ];
}
