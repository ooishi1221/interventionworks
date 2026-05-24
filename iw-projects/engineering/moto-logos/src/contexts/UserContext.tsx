/**
 * UserContext — ユーザー識別 + 認証状態管理
 *
 * 匿名ファースト設計:
 * - 初回起動: Anonymous Auth → auth.uid を userId として使用
 * - 既存ユーザー（移行前）: deviceId を引き続き使用
 * - アカウント連携後: auth.uid に切り替え + Firestore データ移行
 * - 新端末復元: ソーシャルサインインで同じ auth.uid → データ復活
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth } from '../firebase/config';
import { ensureUserDocument } from '../firebase/firestoreService';
import {
  type AuthProvider,
  getAuthProviderType,
  isMigrated,
  markMigrated,
  getOldDeviceId,
  migrateUserData,
  signInWithApple as doAppleSignIn,
  signInWithGoogle as doGoogleSignIn,
  signOutAndReset,
} from '../firebase/authService';
import { captureError, setBetaUser } from '../utils/sentry';

// ─────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────

export interface UserState {
  userId: string;
  authProvider: AuthProvider;
  isLinked: boolean;
}

interface UserContextValue extends UserState {
  /** Apple でサインイン / アカウントリンク */
  linkApple: () => Promise<void>;
  /** Google でサインイン / アカウントリンク */
  linkGoogle: () => Promise<void>;
  /** サインアウト（匿名に戻る） */
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

const DEVICE_ID_KEY = 'moto_logos_device_id';

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

export function UserProvider({ nickname, children }: { nickname: string; children: ReactNode }) {
  const [state, setState] = useState<UserState | null>(null);

  // 初期化: auth.uid or 旧 deviceId を判定
  useEffect(() => {
    (async () => {
      try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return; // authReady 前には呼ばれないはず

        const authUid = currentUser.uid;
        const provider = getAuthProviderType(currentUser);
        const isLinked = provider !== 'anonymous';
        const migrated = await isMigrated();
        const oldDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

        if (isLinked && migrated) {
          // 連携済み + 移行済み → auth.uid を使用
          await ensureUserDocument(authUid, nickname || 'ライダー');
          setBetaUser(authUid);
          setState({ userId: authUid, authProvider: provider, isLinked: true });
        } else if (isLinked && !migrated && oldDeviceId) {
          // 連携済みだが移行未完了（前回中断？）→ リトライ
          await migrateUserData(oldDeviceId, authUid);
          await ensureUserDocument(authUid, nickname || 'ライダー');
          setBetaUser(authUid);
          setState({ userId: authUid, authProvider: provider, isLinked: true });
        } else if (!isLinked && oldDeviceId && oldDeviceId !== authUid) {
          // 匿名 + 旧 deviceId → auth.uid に移行
          await migrateUserData(oldDeviceId, authUid);
          await ensureUserDocument(authUid, nickname || 'ライダー');
          setBetaUser(authUid);
          setState({ userId: authUid, authProvider: 'anonymous', isLinked: false });
        } else {
          // 新規ユーザー → auth.uid を最初から使用
          await AsyncStorage.setItem(DEVICE_ID_KEY, authUid);
          await markMigrated();
          await ensureUserDocument(authUid, nickname || 'ライダー');
          setBetaUser(authUid);
          setState({ userId: authUid, authProvider: 'anonymous', isLinked: false });
        }
      } catch (e) {
        captureError(e, { context: 'user_context_init' });
      }
    })();
  }, [nickname]);

  // Apple アカウントリンク
  const linkApple = useCallback(async () => {
    const result = await doAppleSignIn();
    const authUid = result.user.uid;
    const provider = getAuthProviderType(result.user);

    // データ移行
    const oldDeviceId = await getOldDeviceId();
    if (oldDeviceId && oldDeviceId !== authUid) {
      await migrateUserData(oldDeviceId, authUid);
    } else {
      await markMigrated();
    }

    await ensureUserDocument(authUid, nickname || 'ライダー');
    setBetaUser(authUid);
    setState({ userId: authUid, authProvider: provider, isLinked: true });
  }, [nickname]);

  // Google アカウントリンク
  const linkGoogle = useCallback(async () => {
    const result = await doGoogleSignIn();
    const authUid = result.user.uid;
    const provider = getAuthProviderType(result.user);

    // データ移行
    const oldDeviceId = await getOldDeviceId();
    if (oldDeviceId && oldDeviceId !== authUid) {
      await migrateUserData(oldDeviceId, authUid);
    } else {
      await markMigrated();
    }

    await ensureUserDocument(authUid, nickname || 'ライダー');
    setBetaUser(authUid);
    setState({ userId: authUid, authProvider: provider, isLinked: true });
  }, [nickname]);

  // サインアウト
  const logout = useCallback(async () => {
    const newUser = await signOutAndReset();
    const newUid = newUser.uid;
    await AsyncStorage.setItem(DEVICE_ID_KEY, newUid);
    await markMigrated();
    await ensureUserDocument(newUid, nickname || 'ライダー');
    setBetaUser(newUid);
    setState({ userId: newUid, authProvider: 'anonymous', isLinked: false });
  }, [nickname]);

  const value: UserContextValue | null = state
    ? { ...state, linkApple, linkGoogle, logout }
    : null;

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// ─────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────

/**
 * ユーザー情報 + 認証アクションを取得するフック。
 * UserProvider 配下でなければ null を返す。
 */
export function useUser(): UserContextValue | null {
  return useContext(UserContext);
}

/**
 * userId のみ取得する軽量フック（後方互換）。
 */
export function useUserId(): string | null {
  const ctx = useContext(UserContext);
  return ctx?.userId ?? null;
}
