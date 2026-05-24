/**
 * Firestore 全コレクション バックアップスクリプト
 *
 * 使い方:
 *   node scripts/backup-firestore.mjs
 *
 * 出力:
 *   backups/YYYY-MM-DD_HHmmss/ 以下に各コレクションの JSON ファイル
 *
 * 前提条件:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY 環境変数にサービスアカウントキーの JSON が設定されている
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

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

// バックアップ対象コレクション
const COLLECTIONS = ['spots', 'users', 'reviews', 'validations', 'moderation_logs'];

// タイムスタンプ付きディレクトリ作成
const now = new Date();
const timestamp = now.toISOString().replace(/[T:]/g, '-').replace(/\..+/, '').replace(/-/g, (m, i) => i <= 6 ? '-' : '');
const pad = (n) => String(n).padStart(2, '0');
const dirName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupDir = join(__dirname, '..', 'backups', dirName);
mkdirSync(backupDir, { recursive: true });

console.log(`[Backup] 開始: ${dirName}`);
console.log(`[Backup] 出力先: ${backupDir}`);

let totalDocs = 0;

for (const name of COLLECTIONS) {
  const snapshot = await db.collection(name).get();
  const docs = [];

  snapshot.forEach((doc) => {
    docs.push({ id: doc.id, ...doc.data() });
  });

  const filePath = join(backupDir, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(docs, null, 2));

  console.log(`  ${name}: ${docs.length} docs`);
  totalDocs += docs.length;
}

// メタデータ
const meta = {
  timestamp: now.toISOString(),
  collections: COLLECTIONS,
  totalDocs,
  project: 'moto-spotter',
};
writeFileSync(join(backupDir, '_meta.json'), JSON.stringify(meta, null, 2));

console.log(`[Backup] 完了: ${totalDocs} docs を ${COLLECTIONS.length} コレクションからエクスポート`);
