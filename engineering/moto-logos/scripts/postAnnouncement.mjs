/**
 * Firestore にお知らせを投稿するスクリプト
 * 使い方: node scripts/postAnnouncement.mjs
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// .env から Firebase 設定を読み込み
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const envLines = readFileSync(envPath, 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const app = initializeApp({
  apiKey:            env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

const db = getFirestore(app);
const auth = getAuth(app);
await signInAnonymously(auth);
console.log('匿名認証OK');

// ── 投稿内容 ──
const announcement = {
  title: 'CBTテスト開始のお知らせ',
  body: 'Moto-Logosのクローズドベータテスト（CBT）を開始しました！\n\nテスト期間中は、スポットの登録・レビュー・報告など全機能をお試しいただけます。バグや改善点を見つけたら「設定 → お問い合わせ」からご報告ください。\n\nライダーの皆さんと一緒に、最高の地図を作りましょう。',
  createdAt: Timestamp.now(),
};

const ref = await addDoc(collection(db, 'announcements'), announcement);
console.log(`投稿完了: ${ref.id}`);
console.log(`タイトル: ${announcement.title}`);
process.exit(0);
