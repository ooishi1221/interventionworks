/**
 * Firebase 初期化 — Moto-Spotter
 *
 * - オフライン永続キャッシュ有効（Firestore Read 節約）
 * - 一度表示したエリアは通信なしでスマホから読み出し
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// シングルトン: Fast Refresh で複数回実行されるため再初期化を防ぐ
const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

/**
 * Firestore インスタンス（永続キャッシュ付き）
 *
 * persistentLocalCache:
 *   - IndexedDB を使った永続オフラインキャッシュ
 *   - 一度取得したドキュメントはオフラインでも読める
 *   - Firestore Read カウントを大幅節約
 */
let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (!_db) {
    try {
      _db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      // 既に初期化済み (Hot Reload 時) の場合は既存インスタンスを取得
      const { getFirestore } = require('firebase/firestore');
      _db = getFirestore(app);
    }
  }
  return _db;
}

// 後方互換: 既存コードの `import { db }` をそのまま動かす
export const db: Firestore = getDb();
export default app;
