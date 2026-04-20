/**
 * UserBlocksContext — 自分がブロックしたライダーの uid セット
 *
 * ブロック中のユーザーのワンショットを画面から除外するのに使う。
 * Firestore onSnapshot でリアルタイム同期。
 */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { getFirebaseAuth } from '../firebase/config';
import { subscribeUserBlocks, blockUser as blockUserApi, unblockUser as unblockUserApi } from '../firebase/userBlocks';
import { captureError } from '../utils/sentry';

type Ctx = {
  blocked: Set<string>;
  isBlocked: (uid: string | null | undefined) => boolean;
  blockUser: (targetUid: string) => Promise<void>;
  unblockUser: (targetUid: string) => Promise<void>;
};

const EMPTY: Ctx = {
  blocked: new Set(),
  isBlocked: () => false,
  blockUser: async () => {},
  unblockUser: async () => {},
};

const UserBlocksCtx = createContext<Ctx>(EMPTY);

export function UserBlocksProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = subscribeUserBlocks(uid, setBlocked);
    return () => unsub();
  }, []);

  const isBlocked = useCallback((uid: string | null | undefined) => {
    if (!uid) return false;
    return blocked.has(uid);
  }, [blocked]);

  const blockUser = useCallback(async (targetUid: string) => {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) return;
    try {
      await blockUserApi(uid, targetUid);
    } catch (e) {
      captureError(e, { context: 'block_user' });
      throw e;
    }
  }, []);

  const unblockUser = useCallback(async (targetUid: string) => {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) return;
    try {
      await unblockUserApi(uid, targetUid);
    } catch (e) {
      captureError(e, { context: 'unblock_user' });
      throw e;
    }
  }, []);

  const value = useMemo<Ctx>(() => ({
    blocked,
    isBlocked,
    blockUser,
    unblockUser,
  }), [blocked, isBlocked, blockUser, unblockUser]);

  return <UserBlocksCtx.Provider value={value}>{children}</UserBlocksCtx.Provider>;
}

export function useUserBlocks(): Ctx {
  return useContext(UserBlocksCtx);
}
