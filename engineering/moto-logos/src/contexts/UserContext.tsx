/**
 * UserContext — デバイスベースのユーザー識別
 *
 * - AsyncStorage の deviceId を userId として使用
 * - Firestore `users` コレクションにプロフィールを自動作成
 * - 将来の Firebase Auth 移行パスを確保（userId の差し替えのみ）
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureUserDocument } from '../firebase/firestoreService';
import type { UserRank } from '../firebase/firestoreTypes';

interface UserState {
  /** Firestore ドキュメントID（= deviceId） */
  userId: string;
  /** 現在のランク */
  rank: UserRank;
  /** 信頼スコア */
  trustScore: number;
}

const UserContext = createContext<UserState | null>(null);

const DEVICE_ID_KEY = 'moto_logos_device_id';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function UserProvider({ nickname, children }: { nickname: string; children: ReactNode }) {
  const [user, setUser] = useState<UserState | null>(null);

  useEffect(() => {
    (async () => {
      // 1) deviceId を取得 or 生成
      let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = generateUUID();
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      }

      // 2) Firestore users ドキュメントを作成 or 取得
      const profile = await ensureUserDocument(deviceId, nickname || 'ライダー');
      setUser({
        userId: deviceId,
        rank: profile.rank,
        trustScore: profile.trustScore,
      });
    })();
  }, [nickname]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * userId を取得するフック。
 * UserProvider 配下でなければ null を返す（安全にフォールバック可能）。
 */
export function useUser(): UserState | null {
  return useContext(UserContext);
}
