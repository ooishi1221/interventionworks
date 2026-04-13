/**
 * SpotsListModal — 共有スポット一覧（編集・削除対応）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Spacing, FontSize } from '../constants/theme';
import { UserSpot, MaxCC, ParkingPin } from '../types';
import { getAllUserSpots, deleteUserSpot, updateUserSpot, getUserRank } from '../db/database';
import { addUserSpotToFirestore, deleteUserSpotFromFirestore } from '../firebase/firestoreService';
import { captureError } from '../utils/sentry';

const C = {
  bg: '#000000', card: '#1C1C1E', border: 'rgba(255,255,255,0.10)',
  text: '#F2F2F7', sub: '#8E8E93', blue: '#0A84FF',
  red: '#FF453A', green: '#30D158', purple: '#BF5AF2',
};

const MAX_CC_OPTIONS: { value: MaxCC; label: string }[] = [
  { value: null, label: '制限なし' },
  { value: 250,  label: '〜250cc' },
  { value: 125,  label: '〜125cc' },
  { value: 50,   label: '原付のみ' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onGoToSpot?: (spot: ParkingPin) => void;
}

export function SpotsListModal({ visible, onClose, onGoToSpot }: Props) {
  const [spots, setSpots] = useState<UserSpot[]>([]);
  const [editSpot, setEditSpot] = useState<UserSpot | null>(null);
  const [form, setForm] = useState({ name: '', maxCC: null as MaxCC, isFree: true as boolean | null, capacity: '', price: '' });
  const [saving, setSaving] = useState(false);
  const swipeRefs = useRef<Map<number, Swipeable>>(new Map());

  const load = useCallback(async () => {
    setSpots(await getAllUserSpots());
  }, []);

  useEffect(() => { if (visible) load(); }, [visible]);

  const handleDelete = (spot: UserSpot) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('削除確認', `「${spot.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel', onPress: () => swipeRefs.current.get(spot.id)?.close() },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await deleteUserSpot(spot.id);
          deleteUserSpotFromFirestore(spot.id).catch((e) => captureError(e, { context: 'spot_delete_sync' }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSpots((prev) => prev.filter((s) => s.id !== spot.id));
        },
      },
    ]);
  };

  const openEdit = (spot: UserSpot) => {
    setEditSpot(spot);
    setForm({
      name: spot.name,
      maxCC: spot.maxCC,
      isFree: spot.isFree,
      capacity: spot.capacity ? String(spot.capacity) : '',
      price: spot.pricePerHour ? String(spot.pricePerHour) : '',
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveEdit = async () => {
    if (!editSpot || !form.name.trim()) return;
    setSaving(true);
    const data = {
      name: form.name.trim(),
      latitude: editSpot.latitude,
      longitude: editSpot.longitude,
      address: editSpot.address,
      maxCC: form.maxCC,
      isFree: form.isFree,
      capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
      pricePerHour: form.price ? parseFloat(form.price) : undefined,
    };
    await updateUserSpot(editSpot.id, data);
    const rank = await getUserRank();
    addUserSpotToFirestore(editSpot.id, data, rank).catch((e) => captureError(e, { context: 'spot_edit_sync' }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditSpot(null);
    setSaving(false);
    await load();
  };

  const renderRightActions = (
    _p: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
    spot: UserSpot,
  ) => {
    const scale = dragX.interpolate({ inputRange: [-100, -50, 0], outputRange: [1.1, 1, 0.8], extrapolate: 'clamp' });
    return (
      <TouchableOpacity style={styles.swipeRight} onPress={() => handleDelete(spot)}>
        <RNAnimated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash" size={22} color="#fff" />
          <Text style={styles.swipeLabel}>削除</Text>
        </RNAnimated.View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: UserSpot }) => (
    <Swipeable
      ref={(ref) => { if (ref) swipeRefs.current.set(item.id, ref); else swipeRefs.current.delete(item.id); }}
      renderRightActions={(p, d) => renderRightActions(p, d, item)}
      overshootRight={false} friction={2}
      onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    >
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.75}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: C.purple }]}>
              <Text style={styles.badgeText}>{item.maxCC ? `〜${item.maxCC}cc` : '制限なし'}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: item.isFree ? C.green : 'rgba(255,255,255,0.06)' }]}>
              <Text style={[styles.badgeText, !item.isFree && { color: C.sub }]}>{item.isFree ? '無料' : '有料'}</Text>
            </View>
          </View>
          {item.address && <Text style={styles.cardMeta} numberOfLines={1}>{item.address}</Text>}
        </View>
        <Ionicons name="create-outline" size={16} color={C.sub} />
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Ionicons name="location" size={18} color={C.purple} />
          <Text style={styles.title}>共有スポット ({spots.length})</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>

        {spots.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={48} color={C.sub} />
            <Text style={styles.emptyText}>共有スポットがまだありません</Text>
          </View>
        ) : (
          <FlatList
            data={spots}
            keyExtractor={(s) => String(s.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}

        {/* 編集モーダル */}
        <Modal visible={!!editSpot} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditSpot(null)}>
          <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setEditSpot(null)}>
                <Text style={styles.closeText}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.title}>スポットを編集</Text>
              <View style={{ width: 60 }} />
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.formContent}>
                <Text style={styles.formLabel}>名称</Text>
                <TextInput style={styles.formInput} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholderTextColor={C.sub} />

                <Text style={styles.formLabel}>最大排気量</Text>
                <View style={styles.formChipRow}>
                  {MAX_CC_OPTIONS.map((o) => (
                    <TouchableOpacity key={String(o.value)} style={[styles.formChip, form.maxCC === o.value && styles.formChipActive]} onPress={() => setForm((f) => ({ ...f, maxCC: o.value }))}>
                      <Text style={[styles.formChipText, form.maxCC === o.value && styles.formChipTextActive]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>料金</Text>
                <View style={styles.formChipRow}>
                  {[{ v: true, l: '無料' }, { v: false, l: '有料' }].map(({ v, l }) => (
                    <TouchableOpacity key={l} style={[styles.formChip, form.isFree === v && styles.formChipActive]} onPress={() => setForm((f) => ({ ...f, isFree: v }))}>
                      <Text style={[styles.formChipText, form.isFree === v && styles.formChipTextActive]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!form.isFree && (
                  <>
                    <Text style={styles.formLabel}>料金（円/時）</Text>
                    <TextInput style={styles.formInput} value={form.price} onChangeText={(v) => setForm((f) => ({ ...f, price: v }))} keyboardType="numeric" placeholderTextColor={C.sub} placeholder="例: 200" />
                  </>
                )}

                <Text style={styles.formLabel}>収容台数</Text>
                <TextInput style={styles.formInput} value={form.capacity} onChangeText={(v) => setForm((f) => ({ ...f, capacity: v }))} keyboardType="numeric" placeholderTextColor={C.sub} placeholder="例: 10" />

                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                  <Text style={styles.saveBtnText}>更新する</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  title: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  closeText: { color: C.blue, fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { color: C.sub, fontSize: FontSize.md },
  card: { backgroundColor: C.card, marginHorizontal: Spacing.md, marginVertical: 3, borderRadius: 12, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  cardLeft: { flex: 1, gap: 4 },
  cardName: { color: C.text, fontSize: FontSize.md, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardMeta: { color: C.sub, fontSize: 11 },
  swipeRight: { backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', width: 72, marginVertical: 3, borderTopRightRadius: 12, borderBottomRightRadius: 12, marginRight: Spacing.md },
  swipeLabel: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 2 },
  formContent: { padding: Spacing.lg, gap: 4 },
  formLabel: { color: C.sub, fontSize: 13, marginTop: 12 },
  formInput: { backgroundColor: '#1C1C1E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginTop: 4 },
  formChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  formChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)' },
  formChipActive: { backgroundColor: C.blue, borderColor: C.blue },
  formChipText: { color: C.sub, fontSize: 13 },
  formChipTextActive: { color: '#fff', fontWeight: '700' },
  saveBtn: { marginTop: 24, backgroundColor: C.blue, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
