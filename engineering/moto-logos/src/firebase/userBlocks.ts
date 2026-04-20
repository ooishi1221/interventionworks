/**
 * userBlocks — 自分がブロックしたユーザーの管理
 *
 * Apple App Store Guideline 1.2 準拠。
 * `user_blocks/{uid}` ドキュメントに `blocked: string[]` で保存。
 */
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { COLLECTIONS } from './firestoreTypes';

export function subscribeUserBlocks(
  uid: string,
  onChange: (blocked: Set<string>) => void,
): Unsubscribe {
  const ref = doc(db, COLLECTIONS.USER_BLOCKS, uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      const list = Array.isArray(data?.blocked) ? (data!.blocked as string[]) : [];
      onChange(new Set(list));
    },
    () => onChange(new Set()),
  );
}

export async function blockUser(selfUid: string, targetUid: string): Promise<void> {
  if (!selfUid || !targetUid || selfUid === targetUid) return;
  const ref = doc(db, COLLECTIONS.USER_BLOCKS, selfUid);
  try {
    await updateDoc(ref, {
      blocked: arrayUnion(targetUid),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // ドキュメント未作成なら新規作成
    await setDoc(ref, {
      blocked: [targetUid],
      updatedAt: serverTimestamp(),
    });
  }
}

export async function unblockUser(selfUid: string, targetUid: string): Promise<void> {
  if (!selfUid || !targetUid) return;
  const ref = doc(db, COLLECTIONS.USER_BLOCKS, selfUid);
  await updateDoc(ref, {
    blocked: arrayRemove(targetUid),
    updatedAt: serverTimestamp(),
  });
}
