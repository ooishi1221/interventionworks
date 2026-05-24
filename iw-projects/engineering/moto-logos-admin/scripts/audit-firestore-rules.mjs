/**
 * Firestore セキュリティルール監査スクリプト
 *
 * クライアントSDK（非Admin）で各コレクションへのアクセス可否をテストし、
 * 未認証ユーザーがデータを読み書きできないことを検証する。
 *
 * 使い方:
 *   node scripts/audit-firestore-rules.mjs
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, limit } from 'firebase/firestore';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS = ['spots', 'users', 'reviews', 'validations', 'moderation_logs'];

const results = [];

function record(collection, operation, allowed, detail = '') {
  const status = allowed ? '⚠️  OPEN' : '🔒 DENIED';
  results.push({ collection, operation, allowed, status, detail });
}

console.log('=== Firestore セキュリティルール監査 ===');
console.log(`プロジェクト: ${firebaseConfig.projectId}`);
console.log(`テストモード: 未認証ユーザー（クライアントSDK）`);
console.log(`日時: ${new Date().toISOString()}\n`);

for (const name of COLLECTIONS) {
  console.log(`--- ${name} ---`);
  const col = collection(db, name);

  // READ テスト
  try {
    const snap = await getDocs(query(col, limit(1)));
    record(name, 'READ', true, `${snap.size} doc(s) returned`);
    console.log(`  READ:   ⚠️  OPEN (${snap.size} docs)`);
  } catch (e) {
    record(name, 'READ', false, e.code);
    console.log(`  READ:   🔒 DENIED (${e.code})`);
  }

  // WRITE テスト (create)
  try {
    const testDoc = await addDoc(col, { _audit_test: true, _timestamp: new Date().toISOString() });
    record(name, 'CREATE', true, `doc created: ${testDoc.id}`);
    console.log(`  CREATE: ⚠️  OPEN (${testDoc.id})`);

    // クリーンアップ: テストドキュメント削除を試みる
    try {
      await deleteDoc(doc(db, name, testDoc.id));
      record(name, 'DELETE', true, 'audit test doc cleaned up');
      console.log(`  DELETE: ⚠️  OPEN (cleaned up)`);
    } catch (e) {
      record(name, 'DELETE', false, e.code);
      console.log(`  DELETE: 🔒 DENIED (${e.code}) — テストドキュメント ${testDoc.id} が残っています`);
    }
  } catch (e) {
    record(name, 'CREATE', false, e.code);
    console.log(`  CREATE: 🔒 DENIED (${e.code})`);
  }
}

// サマリー
console.log('\n=== 監査サマリー ===\n');

const open = results.filter(r => r.allowed);
const denied = results.filter(r => !r.allowed);

if (open.length === 0) {
  console.log('✅ 全テスト DENIED — 未認証アクセスはブロックされています。');
} else {
  console.log(`⚠️  ${open.length} 件のオープンアクセスが検出されました:\n`);
  for (const r of open) {
    console.log(`  ${r.status}  ${r.collection}.${r.operation} — ${r.detail}`);
  }
  console.log('\n推奨: Firebase Console → Firestore → Rules で該当コレクションのルールを制限してください。');
}

console.log(`\n合計: ${results.length} テスト (OPEN: ${open.length}, DENIED: ${denied.length})`);

process.exit(open.length > 0 ? 1 : 0);
