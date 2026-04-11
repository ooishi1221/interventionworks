#!/usr/bin/env node
/**
 * テストデータ削除スクリプト
 * Firestore の user_ スポット + local_user レビューを削除
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf-8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log('=== テストデータ削除 ===\n');

// 1. user_ スポット削除
const spotsSnap = await db.collection('spots').where('source', '==', 'user').get();
console.log(`ユーザースポット: ${spotsSnap.size} 件`);
if (spotsSnap.size > 0) {
  const batch = db.batch();
  for (const doc of spotsSnap.docs) batch.delete(doc.ref);
  await batch.commit();
  console.log('  → 削除完了');
}

// 2. local_user レビュー削除
const reviewsSnap = await db.collection('reviews').where('userId', '==', 'local_user').get();
console.log(`ユーザーレビュー: ${reviewsSnap.size} 件`);
if (reviewsSnap.size > 0) {
  const batch = db.batch();
  for (const doc of reviewsSnap.docs) batch.delete(doc.ref);
  await batch.commit();
  console.log('  → 削除完了');
}

console.log('\nFirestore のテストデータを削除しました。');
console.log('アプリ側のローカルデータは次回起動時にリセットされます。');
