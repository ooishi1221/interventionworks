/**
 * Firebase 初期化 — Moto-Spotter
 *
 * 使い方:
 *   1. .env.example を .env にコピーして Firebase Console のConfig値を入力
 *   2. このファイルから db をインポートして Firestore を使用
 *
 * 環境変数は Expo SDK 50+ の EXPO_PUBLIC_ プレフィックスで自動的にバンドルに埋め込まれる。
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// シングルトン: React Native では Fast Refresh で複数回実行されるため再初期化を防ぐ
const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db: Firestore = getFirestore(app);
export default app;
