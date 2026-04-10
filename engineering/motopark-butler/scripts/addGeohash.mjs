#!/usr/bin/env node
/**
 * 既存 Firestore スポットに geohash フィールドを一括追加するマイグレーション
 *
 * 使い方:
 *   node scripts/addGeohash.mjs
 *
 * 前提:
 *   scripts/serviceAccount.json が配置済み
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    if (bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

// ─── メイン ──────────────────────────────────────────
const sa = JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf-8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log('=== geohash 一括追加マイグレーション ===\n');

const snap = await db.collection('spots').get();
console.log(`対象: ${snap.size} 件`);

let updated = 0;
let skipped = 0;
const BATCH_SIZE = 499;

for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const chunk = snap.docs.slice(i, i + BATCH_SIZE);

  for (const doc of chunk) {
    const data = doc.data();
    if (data.geohash) { skipped++; continue; }
    const coord = data.coordinate;
    if (!coord) { skipped++; continue; }
    const gh = encodeGeohash(coord.latitude, coord.longitude, 9);
    batch.update(doc.ref, { geohash: gh });
    updated++;
  }

  await batch.commit();
  process.stdout.write(`\r  処理中... ${Math.min(i + BATCH_SIZE, snap.size)}/${snap.size}`);
}

console.log(`\n\n完了: ${updated} 件に geohash を追加 (${skipped} 件スキップ)`);
console.log('\n次のステップ: Firestore Console で複合インデックスを作成してください:');
console.log('  コレクション: spots');
console.log('  フィールド: geohash (昇順)');
