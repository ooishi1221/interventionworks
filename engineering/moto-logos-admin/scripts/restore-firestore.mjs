/**
 * Firestore リストアスクリプト
 *
 * 使い方:
 *   node scripts/restore-firestore.mjs <backup-dir>
 *
 * 例:
 *   node scripts/restore-firestore.mjs backups/2026-04-12_163000
 *
 * 注意:
 *   - 既存ドキュメントは上書きされます（merge ではなく set）
 *   - 本番実行前に必ずバックアップを取ってください
 *
 * 前提条件:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY 環境変数にサービスアカウントキーの JSON が設定されている
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('使い方: node scripts/restore-firestore.mjs <backup-dir>');
  console.error('例:     node scripts/restore-firestore.mjs backups/2026-04-12_163000');
  process.exit(1);
}

const backupDir = resolve(__dirname, '..', backupPath);

if (!existsSync(join(backupDir, '_meta.json'))) {
  console.error(`[Error] _meta.json が見つかりません: ${backupDir}`);
  console.error('正しいバックアップディレクトリを指定してください。');
  process.exit(1);
}

// --- Firebase Admin 初期化 ---
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (serviceAccountKey) {
  const sa = JSON.parse(serviceAccountKey);
  initializeApp({ credential: cert(sa) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8'));
  initializeApp({ credential: cert(sa) });
} else {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY または GOOGLE_APPLICATION_CREDENTIALS を設定してください');
  process.exit(1);
}

const db = getFirestore();

const meta = JSON.parse(readFileSync(join(backupDir, '_meta.json'), 'utf-8'));
console.log(`[Restore] バックアップ: ${meta.timestamp}`);
console.log(`[Restore] コレクション: ${meta.collections.join(', ')}`);
console.log(`[Restore] 合計: ${meta.totalDocs} docs`);
console.log('');

// 確認プロンプト（--force で省略可能）
if (!process.argv.includes('--force')) {
  console.log('⚠️  既存データは上書きされます。続行するには --force を付けて再実行してください。');
  console.log(`   node scripts/restore-firestore.mjs ${backupPath} --force`);
  process.exit(0);
}

let totalRestored = 0;

for (const name of meta.collections) {
  const filePath = join(backupDir, `${name}.json`);
  if (!existsSync(filePath)) {
    console.log(`  ${name}: スキップ (ファイルなし)`);
    continue;
  }

  const docs = JSON.parse(readFileSync(filePath, 'utf-8'));

  // バッチ書き込み (500件ずつ)
  const BATCH_SIZE = 499;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const doc of chunk) {
      const { id, ...data } = doc;
      batch.set(db.collection(name).doc(id), data);
    }

    await batch.commit();
  }

  console.log(`  ${name}: ${docs.length} docs リストア完了`);
  totalRestored += docs.length;
}

console.log(`\n[Restore] 完了: ${totalRestored} docs をリストア`);
