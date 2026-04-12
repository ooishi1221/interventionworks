import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Animated as RNAnimated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { MaxCC, UserSpot, ParkingPin } from '../types';
import { insertUserSpot, getAllUserSpots, deleteUserSpot, updateUserSpot, getUserRank } from '../db/database';
import { addUserSpotToFirestore, deleteUserSpotFromFirestore } from '../firebase/firestoreService';

// ─── 色定数（Apple Maps 風ダーク） ─────────────────────
const C = {
  bg:     '#000000',
  card:   '#1C1C1E',
  border: 'rgba(255,255,255,0.10)',
  text:   '#F2F2F7',
  sub:    '#8E8E93',
  blue:   '#0A84FF',
  red:    '#FF453A',
  green:  '#30D158',
  purple: '#BF5AF2',
  orange: '#FF9F0A',
};

const MAX_CC_OPTIONS: { value: MaxCC; label: string }[] = [
  { value: null, label: '制限なし' },
  { value: 250,  label: '〜250cc' },
  { value: 125,  label: '〜125cc' },
  { value: 50,   label: '原付のみ' },
];

interface SpotFormState {
  name: string;
  maxCC: MaxCC;
  isFree: boolean;
  capacity: string;
  price: string;
  notes: string;
  lat: number | null;
  lon: number | null;
  address: string;
}

const emptyForm = (): SpotFormState => ({
  name: '',
  maxCC: null,
  isFree: true,
  capacity: '',
  price: '',
  notes: '',
  lat: null,
  lon: null,
  address: '',
});

interface ParkedScreenProps {
  onSpotSaved?: () => void;
  onGoToSpot?: (spot: ParkingPin) => void;
}

export function ParkedScreen({ onSpotSaved, onGoToSpot }: ParkedScreenProps) {
  const [userSpots, setUserSpots] = useState<UserSpot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [form, setForm] = useState<SpotFormState>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  useEffect(() => { loadUserSpots(); }, []);

  const loadUserSpots = async () => {
    setUserSpots(await getAllUserSpots());
  };

  const openNewForm = async () => {
    const f = emptyForm();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        f.lat = loc.coords.latitude;
        f.lon = loc.coords.longitude;
        const [geo] = await Location.reverseGeocodeAsync({ latitude: f.lat, longitude: f.lon });
        if (geo) {
          f.address = [geo.region, geo.city, geo.street, geo.streetNumber].filter(Boolean).join(' ');
        }
      }
    } catch {}
    setForm(f);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (spot: UserSpot) => {
    setForm({
      name: spot.name,
      maxCC: spot.maxCC,
      isFree: spot.isFree,
      capacity: spot.capacity ? String(spot.capacity) : '',
      price: spot.pricePerHour ? String(spot.pricePerHour) : '',
      notes: spot.notes ?? '',
      lat: spot.latitude,
      lon: spot.longitude,
      address: spot.address ?? '',
    });
    setEditingId(spot.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Alert.alert('入力エラー', '名称を入力してください。');
      return;
    }
    if (form.lat === null || form.lon === null) {
      Alert.alert('エラー', '位置情報が取得できませんでした。');
      return;
    }
    setFormLoading(true);
    const spotData = {
      name: form.name.trim(),
      latitude: form.lat,
      longitude: form.lon,
      address: form.address || undefined,
      maxCC: form.maxCC,
      isFree: form.isFree,
      capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
      pricePerHour: form.price ? parseFloat(form.price) : undefined,
      notes: form.notes || undefined,
    };
    try {
      const rank = await getUserRank();
      if (editingId !== null) {
        await updateUserSpot(editingId, spotData);
        addUserSpotToFirestore(editingId, spotData, rank).catch((e) =>
          console.warn('[ParkedScreen] Firestore update failed:', e)
        );
        Alert.alert('更新完了', '駐輪場情報を更新しました。');
      } else {
        const localId = await insertUserSpot(spotData);
        addUserSpotToFirestore(localId, spotData, rank).catch((e) =>
          console.warn('[ParkedScreen] Firestore insert failed:', e)
        );
        const msg = rank === 'novice'
          ? '駐輪場を登録しました。管理者の承認後に地図に表示されます。'
          : '駐輪場を登録しました。地図に表示されます。';
        Alert.alert('登録完了', msg);
      }
      await loadUserSpots();
      setShowForm(false);
      onSpotSaved?.();
    } catch {
      Alert.alert('エラー', '保存に失敗しました。');
    }
    setFormLoading(false);
  };

  const handleDelete = async (spot: UserSpot) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('削除確認', `「${spot.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel', onPress: () => swipeableRefs.current.get(spot.id)?.close() },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteUserSpot(spot.id);
          deleteUserSpotFromFirestore(spot.id).catch((e) =>
            console.warn('[ParkedScreen] Firestore delete failed:', e)
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await loadUserSpots();
        },
      },
    ]);
  };

  const handleCardPress = (spot: UserSpot) => {
    if (editMode) {
      openEditForm(spot);
      return;
    }
    if (!onGoToSpot) return;
    const pin: ParkingPin = {
      id: `user_${spot.id}`,
      name: spot.name,
      latitude: spot.latitude,
      longitude: spot.longitude,
      maxCC: spot.maxCC,
      isFree: spot.isFree,
      capacity: spot.capacity ?? null,
      source: 'user',
      address: spot.address,
    };
    onGoToSpot(pin);
  };

  const setF = (key: keyof SpotFormState, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── 左スワイプ（赤・ゴミ箱） ─────────────────────────
  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
    spot: UserSpot,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1.1, 1, 0.8],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.swipeRight}
        onPress={() => handleDelete(spot)}
      >
        <RNAnimated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash" size={24} color="#fff" />
          <Text style={styles.swipeLabel}>削除</Text>
        </RNAnimated.View>
      </TouchableOpacity>
    );
  };

  // ── リストアイテム ────────────────────────────────────
  const renderItem = ({ item: spot }: { item: UserSpot }) => (
    <Swipeable
      ref={(ref) => {
        if (ref) swipeableRefs.current.set(spot.id, ref);
        else swipeableRefs.current.delete(spot.id);
      }}
      renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, spot)}
      overshootRight={false}
      friction={2}
      onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    >
      <TouchableOpacity
        style={[styles.spotCard, editMode && styles.spotCardEdit]}
        onPress={() => handleCardPress(spot)}
        activeOpacity={0.75}
      >
        <View style={styles.spotMain}>
          <Text style={styles.spotName} numberOfLines={2}>{spot.name}</Text>
          <View style={styles.spotBadges}>
            <View style={[styles.badge, { backgroundColor: C.purple }]}>
              <Text style={styles.badgeText}>{spot.maxCC ? `〜${spot.maxCC}cc` : '制限なし'}</Text>
            </View>
            <View style={[styles.badge, {
              backgroundColor: spot.isFree ? C.green : 'rgba(255,255,255,0.06)',
              borderWidth: spot.isFree ? 0 : StyleSheet.hairlineWidth,
              borderColor: C.border,
            }]}>
              <Text style={[styles.badgeText, !spot.isFree && { color: C.sub }]}>
                {spot.isFree ? '無料' : '有料'}
              </Text>
            </View>
            {spot.capacity != null && (
              <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }]}>
                <Text style={[styles.badgeText, { color: C.sub }]}>{spot.capacity}台</Text>
              </View>
            )}
          </View>
          {spot.address ? <Text style={styles.spotMeta} numberOfLines={1}>{spot.address}</Text> : null}
          {spot.notes ? <Text style={styles.spotMeta} numberOfLines={1}>{spot.notes}</Text> : null}
        </View>
        {editMode ? (
          <Ionicons name="create-outline" size={18} color={C.blue} style={{ marginLeft: 8 }} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={C.sub} style={{ marginLeft: 8 }} />
        )}
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── ヘッダー ─────────────────────────────────── */}
      <View style={styles.header}>
        <Ionicons name="add-circle" size={20} color={C.blue} />
        <Text style={styles.title}>登録</Text>
        {userSpots.length > 0 && (
          <TouchableOpacity
            style={[styles.editToggle, editMode && styles.editToggleActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setEditMode((v) => !v);
            }}
          >
            <Text style={[styles.editToggleText, editMode && styles.editToggleTextActive]}>
              {editMode ? '完了' : '編集'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {userSpots.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={64} color={C.sub} />
          <Text style={styles.emptyText}>あなたが見つけたスポットはまだありません</Text>
          <Text style={styles.emptyHint}>走りながら見つけた「停められる場所」を{'\n'}仲間のために共有しよう</Text>
        </View>
      ) : (
        <>
          <View style={styles.hintBar}>
            <Ionicons name="information-circle-outline" size={14} color={C.sub} />
            <Text style={styles.hintText}>
              {editMode ? 'タップして編集 / 左スワイプで削除' : 'タップで地図に移動 / 左スワイプで削除'}
            </Text>
          </View>
          <FlatList
            data={userSpots}
            keyExtractor={(s) => String(s.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 100 }}
            style={styles.list}
            ListHeaderComponent={
              <Text style={styles.sectionLabel}>登録済みスポット（{userSpots.length}件）</Text>
            }
          />
        </>
      )}

      {/* ── 追加ボタン ────────────────────────────────── */}
      <View style={styles.addBtnWrapper}>
        <TouchableOpacity style={styles.addBtn} onPress={openNewForm} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnText}>スポットを共有する</Text>
        </TouchableOpacity>
      </View>

      {/* ── 登録/編集フォームモーダル ──────────────────── */}
      <Modal
        visible={showForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowForm(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Text style={styles.modalCancelText}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingId !== null ? '駐輪場を編集' : '駐輪場を登録'}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.formContent}>
              <Text style={styles.formLabel}>名称 *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例: 北千住駅東口バイク置き場"
                placeholderTextColor={C.sub}
                value={form.name}
                onChangeText={(v) => setF('name', v)}
              />

              {form.address ? (
                <View style={styles.formMetaRow}>
                  <Ionicons name="location" size={13} color={C.sub} />
                  <Text style={styles.formMeta}>{form.address}</Text>
                </View>
              ) : form.lat !== null ? (
                <View style={styles.formMetaRow}>
                  <Ionicons name="location" size={13} color={C.sub} />
                  <Text style={styles.formMeta}>{form.lat?.toFixed(5)}, {form.lon?.toFixed(5)}</Text>
                </View>
              ) : null}

              <Text style={styles.formLabel}>最大排気量</Text>
              <View style={styles.optionRow}>
                {MAX_CC_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.optionBtn, form.maxCC === opt.value && styles.optionBtnActive]}
                    onPress={() => setF('maxCC', opt.value)}
                  >
                    <Text style={[styles.optionBtnText, form.maxCC === opt.value && styles.optionBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>料金</Text>
              <View style={styles.optionRow}>
                {[{ v: true, l: '無料' }, { v: false, l: '有料' }].map(({ v, l }) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.optionBtn, form.isFree === v && styles.optionBtnActive]}
                    onPress={() => setF('isFree', v)}
                  >
                    <Text style={[styles.optionBtnText, form.isFree === v && styles.optionBtnTextActive]}>
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!form.isFree && (
                <>
                  <Text style={styles.formLabel}>料金（円/時）</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="例: 200"
                    placeholderTextColor={C.sub}
                    keyboardType="numeric"
                    value={form.price}
                    onChangeText={(v) => setF('price', v)}
                  />
                </>
              )}

              <Text style={styles.formLabel}>収容台数</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例: 10"
                placeholderTextColor={C.sub}
                keyboardType="numeric"
                value={form.capacity}
                onChangeText={(v) => setF('capacity', v)}
              />

              <Text style={styles.formLabel}>備考</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMulti]}
                placeholder="例: 屋根あり、夜間施錠あり"
                placeholderTextColor={C.sub}
                multiline
                numberOfLines={3}
                value={form.notes}
                onChangeText={(v) => setF('notes', v)}
              />

              <TouchableOpacity
                style={[styles.submitBtn, formLoading && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={formLoading}
              >
                {formLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {editingId !== null ? '更新する' : '登録する'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={{ height: Spacing.xxl }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── スタイル ──────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // ── ヘッダー ────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  editToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  editToggleActive: {
    backgroundColor: C.blue,
  },
  editToggleText: { color: C.sub, fontSize: 13, fontWeight: '600' },
  editToggleTextActive: { color: '#fff' },

  // ── ヒント ──────────────────────────────────────
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  hintText: { color: C.sub, fontSize: 11 },

  // ── リスト ──────────────────────────────────────
  list: { flex: 1 },
  sectionLabel: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── 空状態 ──────────────────────────────────────
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyText: { color: C.text, fontSize: FontSize.md, fontWeight: '600' },
  emptyHint: { color: C.sub, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  // ── カード ──────────────────────────────────────
  spotCard: {
    backgroundColor: C.card,
    marginHorizontal: Spacing.md,
    marginVertical: 4,
    borderRadius: 14,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  spotCardEdit: {
    borderColor: 'rgba(10,132,255,0.3)',
  },
  spotMain: { flex: 1, gap: 4 },
  spotName: { color: C.text, fontSize: FontSize.md, fontWeight: '600' },
  spotBadges: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  spotMeta: { color: C.sub, fontSize: 12 },

  // ── スワイプ背景 ───────────────────────────────
  swipeRight: {
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    marginRight: Spacing.md,
  },
  swipeLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },

  // ── 追加ボタン ─────────────────────────────────
  addBtnWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingVertical: 14,
  },
  addBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },

  // ── モーダル ───────────────────────────────────
  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  modalCancelText: { color: C.blue, fontSize: FontSize.md },
  modalTitle: { color: C.text, fontSize: FontSize.md, fontWeight: '700' },
  formContent: { padding: Spacing.lg, gap: Spacing.xs },
  formLabel: { color: C.sub, fontSize: FontSize.sm, marginTop: Spacing.sm },
  formMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formMeta: { color: C.sub, fontSize: 12 },
  textInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: C.text,
    fontSize: FontSize.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  textInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  optionBtnActive: { backgroundColor: C.blue, borderColor: C.blue },
  optionBtnText: { color: C.sub, fontSize: FontSize.sm },
  optionBtnTextActive: { color: '#fff', fontWeight: '700' },
  submitBtn: {
    marginTop: Spacing.lg,
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
