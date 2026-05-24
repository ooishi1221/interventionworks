#!/usr/bin/env node
/**
 * 警察ガイド（都内オートバイ駐車場MAP 2024）→ Firestore 投入スクリプト
 *
 * ────────────────────────────────────────────────
 * 使い方:
 *   node scripts/importPoliceGuide.mjs --dry-run     # 重複チェックのみ
 *   node scripts/importPoliceGuide.mjs               # 新規スポットのみ投入
 *   node scripts/importPoliceGuide.mjs --merge-osm   # OSM重複もマージ更新
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

// ─── Haversine 距離チェック ─────────────────────────────
function isNearby(lat1, lon1, lat2, lon2, thresholdMeters = 50) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return d < thresholdMeters;
}

// ─── CC制限の解析（notes フィールドから） ──────────────
function parseCapacity(notes) {
  if (!notes) return { is50only: false, upTo125: false, upTo400: false, isLargeOk: true };

  if (notes.includes('125cc以下のみ利用可') || notes.includes('125cc以下のみ')) {
    return { is50only: false, upTo125: true, upTo400: false, isLargeOk: false };
  }
  if (notes.includes('125cc以下の利用不可')) {
    return { is50only: false, upTo125: false, upTo400: false, isLargeOk: true };
  }
  if (notes.includes('250cc以下のみ利用可') || notes.includes('250cc以下のみ')) {
    return { is50only: false, upTo125: false, upTo400: true, isLargeOk: false };
  }
  if (/50cc以下$/.test(notes) || notes.includes('原付のみ')) {
    return { is50only: true, upTo125: false, upTo400: false, isLargeOk: false };
  }

  return { is50only: false, upTo125: false, upTo400: false, isLargeOk: true };
}

// ─── 営業時間の抽出（notes フィールドから） ────────────
function parseOpenHours(notes) {
  if (!notes) return null;
  const m = notes.match(/営業時間[:：]?\s*(.+?)(?:、|$)/);
  return m ? m[1].trim() : null;
}

// ─── isFree 判定 ──────────────────────────────────────
function parseIsFree(pricing) {
  if (!pricing || pricing.trim() === '') return null;
  // "無料" のみ → true
  if (/^無料$/.test(pricing.trim())) return true;
  return false;
}

// ─── police-guide → Firestore ドキュメント変換 ────────
function toFirestoreDoc(entry) {
  const now = Timestamp.now();
  const openHours = parseOpenHours(entry.notes);

  return {
    name:              entry.name,
    coordinate:        new GeoPoint(entry.latitude, entry.longitude),
    geohash:           encodeGeohash(entry.latitude, entry.longitude, 9),
    address:           `東京都${entry.ward}${entry.address}`,
    capacity:          parseCapacity(entry.notes),
    parkingCapacity:   entry.capacity,
    payment:           { cash: true, icCard: entry.icPayment || false, qrCode: false },
    isFree:            parseIsFree(entry.pricing),
    ...(entry.pricing && entry.pricing.trim() !== '' && { priceInfo: entry.pricing }),
    ...(openHours && { openHours }),
    viewCount:         0,
    goodCount:         0,
    badReportCount:    0,
    status:            'active',
    verificationLevel: 'official',
    source:            'seed',
    updatedAt:         now,
    lastVerifiedAt:    now,
    createdAt:         now,
  };
}

// ─── メイン ──────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const mergeOsm = args.includes('--merge-osm');

console.log('=== 警察ガイド → Firestore 投入スクリプト ===\n');
if (isDryRun) console.log('[DRY RUN] 書き込みは行いません\n');
if (mergeOsm) console.log('[MERGE-OSM] OSM重複スポットをマージ更新します\n');

// Firebase Admin 初期化
const saPath = 'scripts/serviceAccount.json';
if (!existsSync(saPath)) {
  console.error(`[ERROR] サービスアカウントが見つかりません: ${saPath}`);
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf-8'))) });
const db = getFirestore();

// データ読み込み
const dataPath = 'scripts/data/police-guide-geocoded.json';
if (!existsSync(dataPath)) {
  console.error(`[ERROR] データファイルが見つかりません: ${dataPath}`);
  process.exit(1);
}
const policeData = JSON.parse(readFileSync(dataPath, 'utf-8'));
console.log(`警察ガイドデータ: ${policeData.length} 件`);

// ─── Firestore 既存スポット取得 ─────────────────────
console.log('Firestore 既存スポット取得中...');
const existingSnap = await db.collection('spots').get();
const existingSpots = existingSnap.docs.map(doc => ({
  id: doc.id,
  lat: doc.data().coordinate?.latitude,
  lng: doc.data().coordinate?.longitude,
  name: doc.data().name || '',
}));
console.log(`既存スポット: ${existingSpots.length} 件\n`);

// ─── 重複チェック ───────────────────────────────────
const newEntries = [];       // 新規投入
const mergeEntries = [];     // OSMマージ対象
const skipEntries = [];      // スキップ
const dupDetails = [];       // 重複詳細ログ

for (const entry of policeData) {
  const nearby = existingSpots.find(e =>
    e.lat && e.lng && isNearby(entry.latitude, entry.longitude, e.lat, e.lng, 50)
  );

  if (nearby) {
    if (nearby.id.startsWith('osm_')) {
      mergeEntries.push({ entry, existingId: nearby.id, existingName: nearby.name });
      dupDetails.push(`  [OSM重複] #${entry.no} ${entry.name} ↔ ${nearby.id} "${nearby.name}"`);
    } else {
      skipEntries.push({ entry, existingId: nearby.id, existingName: nearby.name });
      dupDetails.push(`  [スキップ] #${entry.no} ${entry.name} ↔ ${nearby.id} "${nearby.name}"`);
    }
  } else {
    newEntries.push(entry);
  }
}

// ─── サマリー表示 ──────────────────────────────────
console.log('─── 重複チェック結果 ───');
console.log(`  新規投入:     ${newEntries.length} 件`);
console.log(`  OSM重複:      ${mergeEntries.length} 件${mergeOsm ? '（マージ更新する）' : '（スキップ）'}`);
console.log(`  その他重複:   ${skipEntries.length} 件（スキップ）`);
console.log(`  合計:         ${policeData.length} 件\n`);

if (dupDetails.length > 0) {
  console.log('─── 重複詳細 ───');
  dupDetails.forEach(d => console.log(d));
  console.log('');
}

if (isDryRun) {
  // dry-run: 先頭5件のプレビュー
  console.log('─── 新規投入プレビュー（先頭5件） ───');
  for (const entry of newEntries.slice(0, 5)) {
    const docId = `police_${String(entry.no).padStart(3, '0')}`;
    const gh = encodeGeohash(entry.latitude, entry.longitude);
    const cc = parseCapacity(entry.notes);
    const ccLabel = cc.is50only ? '50cc以下' : cc.upTo125 ? '〜125cc' : cc.upTo400 ? '〜400cc' : '大型OK';
    console.log(`  ${docId}: ${entry.name} (${entry.ward}) [${ccLabel}] geohash:${gh}`);
  }

  if (mergeEntries.length > 0) {
    console.log('\n─── OSMマージプレビュー（先頭5件） ───');
    for (const { entry, existingId, existingName } of mergeEntries.slice(0, 5)) {
      console.log(`  ${existingId} "${existingName}" → #${entry.no} "${entry.name}" (${entry.ward})`);
    }
  }

  console.log(`\n[DRY RUN 完了] --dry-run を外して実行すると ${newEntries.length}${mergeOsm ? ` + ${mergeEntries.length}` : ''} 件を書き込みます`);
  process.exit(0);
}

// ─── バッチ書き込み ─────────────────────────────────
const BATCH_SIZE = 499;
let written = 0;
let merged = 0;
const startTime = Date.now();

// 新規投入 + マージ対象を統合
const operations = [];

for (const entry of newEntries) {
  const docId = `police_${String(entry.no).padStart(3, '0')}`;
  operations.push({ type: 'set', docId, data: toFirestoreDoc(entry) });
}

if (mergeOsm) {
  for (const { entry, existingId } of mergeEntries) {
    const updateData = toFirestoreDoc(entry);
    delete updateData.viewCount;
    delete updateData.goodCount;
    delete updateData.badReportCount;
    delete updateData.createdAt;
    operations.push({ type: 'update', docId: existingId, data: updateData });
  }
}

for (let i = 0; i < operations.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const chunk = operations.slice(i, i + BATCH_SIZE);

  for (const op of chunk) {
    const ref = db.collection('spots').doc(op.docId);
    if (op.type === 'set') {
      batch.set(ref, op.data);
      written++;
    } else {
      batch.update(ref, op.data);
      merged++;
    }
  }

  await batch.commit();
  const total = written + merged;
  const pct = ((total / operations.length) * 100).toFixed(1);
  process.stdout.write(`\r  書き込み中... ${total}/${operations.length} (${pct}%)`);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n完了 (${elapsed}秒)`);
console.log(`  新規投入: ${written} 件`);
if (mergeOsm) console.log(`  OSMマージ: ${merged} 件`);
console.log(`  スキップ: ${skipEntries.length + (mergeOsm ? 0 : mergeEntries.length)} 件`);
console.log(`  Firestore 合計: 約 ${existingSpots.length + written} 件`);
