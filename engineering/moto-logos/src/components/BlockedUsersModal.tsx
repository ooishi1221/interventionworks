/**
 * BlockedUsersModal — ブロック中のライダー一覧 + 解除
 *
 * 設定画面 → プライバシー → 「ブロック中のライダー」から呼び出される。
 * Apple App Store Guideline 1.2 準拠の一環。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../firebase/firestoreTypes';
import { useUserBlocks } from '../contexts/UserBlocksContext';
import { captureError } from '../utils/sentry';
import { Colors } from '../constants/theme';

const C = Colors;

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Row = { uid: string; displayName?: string };

export function BlockedUsersModal({ visible, onClose }: Props) {
  const { blocked, unblockUser } = useUserBlocks();
  const [rows, setRows] = useState<Row[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const uids = Array.from(blocked);
    // 並列で users コレクションから displayName を解決（失敗時は uid のみ）
    Promise.all(
      uids.map(async (uid): Promise<Row> => {
        try {
          const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
          const data = snap.data() as { displayName?: string } | undefined;
          return { uid, displayName: data?.displayName };
        } catch {
          return { uid };
        }
      }),
    ).then(setRows);
  }, [visible, blocked]);

  const confirmUnblock = useCallback((row: Row) => {
    Alert.alert(
      'ブロック解除',
      `${row.displayName ?? 'このライダー'}のブロックを解除しますか？\n今後このライダーの投稿が再び表示されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          style: 'destructive',
          onPress: async () => {
            setProcessing(row.uid);
            try {
              await unblockUser(row.uid);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              captureError(e, { context: 'unblock_user_ui' });
              Alert.alert('解除に失敗しました', 'ネットワークを確認してもう一度お試しください');
            }
            setProcessing(null);
          },
        },
      ],
    );
  }, [unblockUser]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>ブロック中のライダー</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          {rows.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="people-outline" size={36} color={C.sub} />
              <Text style={s.emptyText}>ブロックしているライダーはいません</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.uid}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => (
                <View style={s.row}>
                  <View style={s.rowLeft}>
                    <View style={s.avatar}>
                      <Ionicons name="person" size={18} color={C.sub} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowName}>
                        {item.displayName ?? 'ライダー'}
                      </Text>
                      <Text style={s.rowUid}>{item.uid.slice(0, 12)}…</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmUnblock(item)}
                    disabled={processing === item.uid}
                    style={[s.unblockBtn, processing === item.uid && { opacity: 0.4 }]}
                  >
                    <Text style={s.unblockText}>解除</Text>
                  </TouchableOpacity>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={s.separator} />}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
    minHeight: '40%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: C.sub, fontSize: 14 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    minHeight: 52,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowUid: { color: C.sub, fontSize: 11, marginTop: 2 },

  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  unblockText: { color: C.text, fontSize: 13, fontWeight: '600' },

  separator: { height: 1, backgroundColor: C.hairline, marginHorizontal: 8 },
});
