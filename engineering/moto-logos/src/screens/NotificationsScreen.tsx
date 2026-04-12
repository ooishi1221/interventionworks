/**
 * NotificationsScreen — お知らせ一覧
 * Firestore announcements コレクションから取得 + ローカル既読管理
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const C = {
  bg: '#000000', surface: '#1C1C1E', card: '#2C2C2E',
  border: 'rgba(255,255,255,0.10)', text: '#F2F2F7',
  sub: '#8E8E93', blue: '#0A84FF', accent: '#FF6B00',
};

const READ_KEY = 'moto_logos_read_announcements';

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

interface Props {
  onBack?: () => void;
}

export function NotificationsScreen({ onBack }: Props) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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
          createdAt: ts?.toDate().toISOString() ?? new Date().toISOString(),
        };
      });
      setItems(results);

      // 既読IDを読み込み
      const raw = await AsyncStorage.getItem(READ_KEY);
      if (raw) setReadIds(new Set(JSON.parse(raw)));

      // 全て既読にマーク
      const allIds = results.map((r) => r.id);
      await AsyncStorage.setItem(READ_KEY, JSON.stringify(allIds));
      setReadIds(new Set(allIds));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
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
          renderItem={({ item }) => (
            <View style={[s.card, !readIds.has(item.id) && s.cardUnread]}>
              {!readIds.has(item.id) && <View style={s.unreadDot} />}
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.cardBody}>{item.body}</Text>
              <Text style={s.cardDate}>{formatDate(item.createdAt)}</Text>
            </View>
          )}
        />
      )}
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
});
