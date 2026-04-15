/**
 * NotificationsScreen — お知らせ一覧
 * Firestore announcements コレクションから取得 + ローカル既読管理
 * カードタップで詳細モーダル表示 → 「閉じる」で閉じられる
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureError } from '../utils/sentry';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Colors } from '../constants/theme';

const C = { ...Colors, card: Colors.cardElevated };

const READ_KEY = 'moto_logos_read_announcements';

interface Announcement {
  id: string;
  title: string;
  body: string;
  sortOrder: number | null;
  createdAt: string;
}

interface Props {
  onBack?: () => void;
}

export function NotificationsScreen({ onBack }: Props) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Firestore announcements を取得
      const q = query(
        collection(db, 'announcements'),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      const results: Announcement[] = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt as Timestamp | undefined;
        return {
          id: d.id,
          title: (data.title as string) || '',
          body: (data.body as string) || '',
          sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : null,
          createdAt: ts?.toDate().toISOString() ?? new Date().toISOString(),
        };
      });

      // sortOrder 昇順（未設定は末尾）→ createdAt 降順
      results.sort((a, b) => {
        const sa = a.sortOrder ?? Infinity;
        const sb = b.sortOrder ?? Infinity;
        if (sa !== sb) return sa - sb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setItems(results);

      // 既読IDを読み込み
      const raw = await AsyncStorage.getItem(READ_KEY);
      if (raw) setReadIds(new Set(JSON.parse(raw)));

      // 全て既読にマーク
      const allIds = results.map((r) => r.id);
      await AsyncStorage.setItem(READ_KEY, JSON.stringify(allIds));
      setReadIds(new Set(allIds));
    } catch (e) {
      captureError(e, { context: 'notifications_load' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
        <Text style={s.headerTitle}>お知らせ</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="notifications-off-outline" size={48} color={C.sub} />
          <Text style={s.emptyText}>お知らせはありません</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={7}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, !readIds.has(item.id) && s.cardUnread]}
              onPress={() => setSelected(item)}
              activeOpacity={0.7}
            >
              {!readIds.has(item.id) && <View style={s.unreadDot} />}
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.cardBody} numberOfLines={2}>{item.body}</Text>
              <Text style={s.cardDate}>{formatDate(item.createdAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── お知らせ詳細モーダル ───────────────────────── */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={s.modalOverlay}>
          <SafeAreaView style={s.modalContainer}>
            {/* ヘッダー */}
            <View style={s.modalHeader}>
              <Text style={s.modalHeaderTitle}>お知らせ</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalContent}>
              <Text style={s.modalTitle}>{selected?.title}</Text>
              <Text style={s.modalDate}>{selected ? formatDate(selected.createdAt) : ''}</Text>
              <View style={s.modalDivider} />
              <Text style={s.modalBody}>{selected?.body}</Text>
            </ScrollView>

            {/* 閉じるボタン */}
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.closeButton} onPress={() => setSelected(null)} activeOpacity={0.8}>
                <Text style={s.closeButtonText}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  backBtn: { width: 32 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: C.sub, fontSize: 14 },
  card: { backgroundColor: C.surface, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardUnread: { borderColor: C.accent },
  unreadDot: { position: 'absolute', top: 16, right: 16, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  cardBody: { color: C.sub, fontSize: 14, lineHeight: 20 },
  cardDate: { color: C.sub, fontSize: 11, marginTop: 8 },
  // モーダル
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContainer: { flex: 1, backgroundColor: C.bg, marginTop: 60, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  modalHeaderTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalTitle: { color: C.text, fontSize: 20, fontWeight: '800', lineHeight: 28 },
  modalDate: { color: C.sub, fontSize: 12, marginTop: 8 },
  modalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 16 },
  modalBody: { color: C.text, fontSize: 15, lineHeight: 24 },
  modalFooter: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  closeButton: { backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeButtonText: { color: C.text, fontSize: 16, fontWeight: '600' },
});
