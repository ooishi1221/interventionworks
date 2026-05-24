/**
 * 認証サービス — ソーシャルログイン + アカウントリンク
 *
 * - 匿名ファースト: 初回は Anonymous Auth で即利用開始
 * - 任意連携: Apple / Google でアカウントリンク → 足跡がデバイスから解放される
 * - 復元: 新端末で同じソーシャルアカウントでサインイン → データ復活
 * - 移行: 旧 deviceId ベースの Firestore データを auth.uid に移行
 */

import { Platform } from 'react-native';
import {
  linkWithCredential,
  signInWithCredential,
  signOut as firebaseSignOut,
  signInAnonymously,
  OAuthProvider,
  GoogleAuthProvider,
  type User,
  type AuthCredential,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth, db } from './config';
import { COLLECTIONS } from './firestoreTypes';
import { captureError } from '../utils/sentry';

// ─────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'moto_logos_device_id';
const MIGRATION_DONE_KEY = 'moto_logos_auth_migrated';

export type AuthProvider = 'anonymous' | 'apple' | 'google';

export interface LinkResult {
  user: User;
  /** true = 新規リンク、false = 既存アカウントに復元 */
  isNewLink: boolean;
}

// ─────────────────────────────────────────────────────
// プロバイダー判定
// ─────────────────────────────────────────────────────

export function getAuthProviderType(user: User | null): AuthProvider {
  if (!user || user.isAnonymous) return 'anonymous';
  const providers = user.providerData.map((p) => p.providerId);
  if (providers.includes('apple.com')) return 'apple';
  if (providers.includes('google.com')) return 'google';
  return 'anonymous';
}

// ─────────────────────────────────────────────────────
// Apple Sign-In
// ─────────────────────────────────────────────────────

export async function signInWithApple(): Promise<LinkResult> {
  // SHA-256 ハッシュ済み nonce（Apple + Firebase の要件）
  const nonce = Math.random().toString(36).substring(2, 10);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) {
    throw new Error('Apple Sign-In: identityToken が取得できませんでした');
  }

  const oauthCredential = new OAuthProvider('apple.com').credential({
    idToken: appleCredential.identityToken,
    rawNonce: nonce,
  });

  return linkOrSignIn(oauthCredential);
}

// ─────────────────────────────────────────────────────
// Google Sign-In
// ─────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<LinkResult> {
  // 動的 import — ネイティブモジュールが未インストールでもビルド時エラーにならない
  const { GoogleSignin } = await import(
    '@react-native-google-signin/google-signin'
  );

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  const response = await GoogleSignin.signIn();
  if (!response.data?.idToken) {
    throw new Error('Google Sign-In: idToken が取得できませんでした');
  }

  const googleCredential = GoogleAuthProvider.credential(response.data.idToken);
  return linkOrSignIn(googleCredential);
}

// ─────────────────────────────────────────────────────
// リンク or サインイン（共通ロジック）
// ─────────────────────────────────────────────────────

async function linkOrSignIn(credential: AuthCredential): Promise<LinkResult> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    // 匿名セッションがない場合は直接サインイン
    const result = await signInWithCredential(auth, credential);
    return { user: result.user, isNewLink: false };
  }

  try {
    // 匿名アカウントにソーシャルクレデンシャルを紐付け
    const result = await linkWithCredential(currentUser, credential);
    return { user: result.user, isNewLink: true };
  } catch (e: unknown) {
    const firebaseError = e as { code?: string };
    if (firebaseError.code === 'auth/credential-already-in-use') {
      // 別端末で既にリンク済み → そのアカウントでサインイン（復元）
      const result = await signInWithCredential(auth, credential);
      return { user: result.user, isNewLink: false };
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────
// サインアウト → 新しい匿名セッション
// ─────────────────────────────────────────────────────

export async function signOutAndReset(): Promise<User> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  const result = await signInAnonymously(auth);
  return result.user;
}

// ─────────────────────────────────────────────────────
// Firestore データ移行（deviceId → auth.uid）
// ─────────────────────────────────────────────────────

/**
 * 旧 deviceId ベースの Firestore データを auth.uid に移行する。
 * - users/{deviceId} → users/{authUid} にコピー
 * - reviews の userId フィールドを一括更新
 * - 旧 users ドキュメントを削除
 *
 * 冪等: 移行済みフラグで二重実行を防止。
 */
export async function migrateUserData(
  oldDeviceId: string,
  newAuthUid: string,
): Promise<void> {
  // 同一IDなら移行不要
  if (oldDeviceId === newAuthUid) {
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
    return;
  }

  // 既に移行済みか確認
  const migrated = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
  if (migrated === 'true') return;

  try {
    // 1) users ドキュメントをコピー
    const oldRef = doc(db, COLLECTIONS.USERS, oldDeviceId);
    const oldSnap = await getDoc(oldRef);

    if (oldSnap.exists()) {
      const data = oldSnap.data();
      const newRef = doc(db, COLLECTIONS.USERS, newAuthUid);
      await setDoc(newRef, {
        ...data,
        linkedFrom: oldDeviceId,
        updatedAt: Timestamp.now(),
      });
      await deleteDoc(oldRef);
    }

    // 2) reviews の userId を一括更新
    const reviewsQ = query(
      collection(db, COLLECTIONS.REVIEWS),
      where('userId', '==', oldDeviceId),
    );
    const reviewsSnap = await getDocs(reviewsQ);

    // Firestore batch は 500 件制限
    for (let i = 0; i < reviewsSnap.docs.length; i += 499) {
      const batch = writeBatch(db);
      const chunk = reviewsSnap.docs.slice(i, i + 499);
      for (const d of chunk) {
        batch.update(d.ref, { userId: newAuthUid });
      }
      await batch.commit();
    }

    // 3) push_tokens の移行
    const oldTokenRef = doc(db, COLLECTIONS.PUSH_TOKENS, oldDeviceId);
    const tokenSnap = await getDoc(oldTokenRef);
    if (tokenSnap.exists()) {
      const tokenData = tokenSnap.data();
      await setDoc(doc(db, COLLECTIONS.PUSH_TOKENS, newAuthUid), {
        ...tokenData,
        userId: newAuthUid,
        updatedAt: Timestamp.now(),
      });
      await deleteDoc(oldTokenRef);
    }

    // 移行完了フラグ
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
  } catch (e) {
    captureError(e, { context: 'migrate_user_data', oldDeviceId, newAuthUid });
    // 次回起動時にリトライするためフラグは立てない
  }
}

// ─────────────────────────────────────────────────────
// 移行状態チェック
// ─────────────────────────────────────────────────────

export async function isMigrated(): Promise<boolean> {
  return (await AsyncStorage.getItem(MIGRATION_DONE_KEY)) === 'true';
}

export async function getOldDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_ID_KEY);
}

export async function markMigrated(): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
}
