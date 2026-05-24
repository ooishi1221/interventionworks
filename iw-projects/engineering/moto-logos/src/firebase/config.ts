/**
 * Firebase 初期化 — Moto-Logos
 *
 * - オフライン永続キャッシュ有効（Firestore Read 節約）
 * - 一度表示したエリアは通信なしでスマホから読み出し
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
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

// Firestore は memoryLocalCache を使用。
// persistentLocalCache は IndexedDB 依存で RN 環境と非互換（特に newArch/Fabric）。
// オフラインキャッシュは SQLite (spotsCache.ts) 側で担保する。
let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (!_db) {
    try {
      _db = initializeFirestore(app, {
        localCache: memoryLocalCache(),
      });
    } catch {
      // 既に初期化済み (Hot Reload 時) の場合は既存インスタンスを取得
      const { getFirestore } = require('firebase/firestore');
      _db = getFirestore(app);
    }
  }
  return _db!;
}

// 後方互換: 既存コードの `import { db }` をそのまま動かす
export const db: Firestore = getDb();

// ─────────────────────────────────────────────────────
// Firebase Storage（レビュー写真のクラウド保存）
// ─────────────────────────────────────────────────────
import { getStorage, type FirebaseStorage } from 'firebase/storage';

let _storage: FirebaseStorage | null = null;

export function getStorageInstance(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(app);
  }
  return _storage;
}

// ─────────────────────────────────────────────────────
// Firebase Auth（匿名認証 — Firestore ルール認可用）
// ─────────────────────────────────────────────────────
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
// @ts-ignore — React Native 環境では getReactNativePersistence が必要
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

let _auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    try {
      _auth = initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      });
    } catch {
      _auth = getAuth(app);
    }
  }
  return _auth;
}

/**
 * 匿名認証でサインイン。既にサインイン済みならそのまま返す。
 * App.tsx の起動時に1回呼ぶ。
 */
export async function ensureAnonymousAuth(): Promise<User> {
  const auth = getFirebaseAuth();

  // getIdToken が iOS で稀に hang する対策: 10秒タイムアウト
  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`TOKEN_TIMEOUT:${label}`)), ms),
      ),
    ]);

  // 既存ユーザーがいる場合: トークンを強制リフレッシュして有効性確認。
  // 失敗時は再サインインにフォールバック（期限切れ・revoke 等）。
  if (auth.currentUser) {
    try {
      await withTimeout(auth.currentUser.getIdToken(true), 10000, 'existingUser');
      return auth.currentUser;
    } catch {
      // fall through to re-sign-in
    }
  }

  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsub();
        try {
          // ID Token の取得を待つ（10秒タイムアウト付き）。
          // これを省くと初回サインイン直後の Firestore クエリが
          // permission-denied で弾かれる。
          await withTimeout(user.getIdToken(true), 10000, 'newUser');
          resolve(user);
        } catch (e) {
          // Token 取れなくても user オブジェクトはあるので、
          // resolve してしまう（permission_denied は呼び出し側で retry）
          resolve(user);
        }
      }
    });
    signInAnonymously(auth).catch(reject);
  });
}

export default app;
