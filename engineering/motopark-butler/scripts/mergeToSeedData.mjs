#!/usr/bin/env node
/**
 * spots-kanto.json を adachi-parking.ts の ADACHI_PARKING 配列に追記する
 *
 * 使い方:
 *   node scripts/mergeToSeedData.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const spots = JSON.parse(readFileSync('scripts/data/spots-kanto.json', 'utf-8'));
const tsPath = 'src/data/adachi-parking.ts';
const existing = readFileSync(tsPath, 'utf-8');

// 既存IDを取得して重複排除
const existingIds = new Set();
const idRegex = /id:\s*'([^']+)'/g;
let m;
while ((m = idRegex.exec(existing))) existingIds.add(m[1]);

const newSpots = spots.filter((s) => !existingIds.has(s.id));
console.log(`既存: ${existingIds.size}件, 新規: ${newSpots.length}件`);

if (newSpots.length === 0) {
  console.log('追加するスポットはありません。');
  process.exit(0);
}

// TypeScript オブジェクトリテラルを生成
const entries = newSpots.map((s) => {
  const fields = [
    `    id: '${s.id}'`,
    `    name: '${s.name.replace(/'/g, "\\'")}'`,
    `    address: '${(s.address || '').replace(/'/g, "\\'")}'`,
    `    latitude: ${s.latitude}, longitude: ${s.longitude}`,
    `    maxCC: ${s.maxCC === null ? 'null' : s.maxCC}, isFree: ${s.isFree}, capacity: ${s.capacity}, source: 'seed'`,
  ];
  if (s.pricePerHour) fields.push(`    pricePerHour: ${s.pricePerHour}`);
  return `  {\n${fields.join(',\n')},\n  }`;
}).join(',\n');

// filterByCC 関数の直前に挿入
const insertPoint = existing.lastIndexOf('];\n\nexport function filterByCC');
if (insertPoint < 0) {
  console.error('挿入位置が見つかりません。手動で追記してください。');
  process.exit(1);
}

const newContent =
  existing.slice(0, insertPoint) +
  '\n  // ── 関東広域 + 静岡・山梨・長野 ────────────────\n' +
  entries + ',\n' +
  existing.slice(insertPoint);

writeFileSync(tsPath, newContent, 'utf-8');
console.log(`${newSpots.length}件を ${tsPath} に追記しました。`);
