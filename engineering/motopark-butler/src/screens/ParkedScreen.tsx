import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import * as Location from 'expo-location';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { MaxCC, UserSpot } from '../types';
import { insertUserSpot, getAllUserSpots, deleteUserSpot, updateUserSpot } from '../db/database';

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

export function ParkedScreen() {
  const [userSpots, setUserSpots] = useState<UserSpot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [form, setForm] = useState<SpotFormState>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    loadUserSpots();
  }, []);

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
      if (editingId !== null) {
        await updateUserSpot(editingId, spotData);
        Alert.alert('更新完了', '駐輪場情報を更新しました。');
      } else {
        await insertUserSpot(spotData);
        Alert.alert('登録完了', '駐輪場を登録しました。地図に表示されます。');
      }
      await loadUserSpots();
      setShowForm(false);
    } catch {
      Alert.alert('エラー', '保存に失敗しました。');
    }
    setFormLoading(false);
  };

  const handleDelete = (spot: UserSpot) => {
    Alert.alert('削除確認', `「${spot.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteUserSpot(spot.id);
          await loadUserSpots();
        },
      },
    ]);
  };

  const setF = (key: keyof SpotFormState, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>＋ 登録</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>

          {userSpots.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🅿️</Text>
              <Text style={styles.emptyText}>登録済みの駐輪場はありません</Text>
              <Text style={styles.emptyHint}>
                現在地の駐輪場を登録すると地図に表示されます
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>登録済みスポット（{userSpots.length}件）</Text>
              {userSpots.map((spot) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  onEdit={() => openEditForm(spot)}
                  onDelete={() => handleDelete(spot)}
                />
              ))}
            </>
          )}

          <TouchableOpacity style={styles.addBtn} onPress={openNewForm}>
            <Text style={styles.addBtnText}>＋ 現在地で駐輪場を登録</Text>
          </TouchableOpacity>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 登録/編集フォームモーダル */}
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
                placeholderTextColor={Colors.textSecondary}
                value={form.name}
                onChangeText={(v) => setF('name', v)}
              />

              {form.address ? (
                <Text style={styles.formMeta}>📍 {form.address}</Text>
              ) : form.lat !== null ? (
                <Text style={styles.formMeta}>📍 {form.lat?.toFixed(5)}, {form.lon?.toFixed(5)}</Text>
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
                    placeholderTextColor={Colors.textSecondary}
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
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numeric"
                value={form.capacity}
                onChangeText={(v) => setF('capacity', v)}
              />

              <Text style={styles.formLabel}>備考</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMulti]}
                placeholder="例: 屋根あり、夜間施錠あり"
                placeholderTextColor={Colors.textSecondary}
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
                  <ActivityIndicator color={Colors.white} />
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

function SpotCard({
  spot,
  onEdit,
  onDelete,
}: {
  spot: UserSpot;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.spotCard}>
      <View style={styles.spotMain}>
        <Text style={styles.spotName}>{spot.name}</Text>
        <View style={styles.spotBadges}>
          <View style={[styles.badge, { backgroundColor: '#9C27B0' }]}>
            <Text style={styles.badgeText}>{spot.maxCC ? `〜${spot.maxCC}cc` : '制限なし'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: spot.isFree ? Colors.success : Colors.surface, borderWidth: spot.isFree ? 0 : 1, borderColor: Colors.border }]}>
            <Text style={[styles.badgeText, !spot.isFree && { color: Colors.textSecondary }]}>
              {spot.isFree ? '無料' : '有料'}
            </Text>
          </View>
          {spot.capacity && (
            <View style={[styles.badge, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}>
              <Text style={[styles.badgeText, { color: Colors.textSecondary }]}>{spot.capacity}台</Text>
            </View>
          )}
        </View>
        {spot.address ? <Text style={styles.spotMeta}>{spot.address}</Text> : null}
        {spot.notes ? <Text style={styles.spotMeta}>{spot.notes}</Text> : null}
      </View>
      <View style={styles.spotActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onEdit}>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onDelete}>
          <Text style={styles.deleteIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: FontSize.lg, fontWeight: 'bold' },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyIcon: { fontSize: 64 },
  emptyText: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' },
  emptyHint: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  addBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: { color: Colors.accent, fontSize: FontSize.md, fontWeight: '700' },
  spotCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  spotMain: { flex: 1, gap: 4 },
  spotName: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' },
  spotBadges: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  badgeText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '700' },
  spotMeta: { color: Colors.textSecondary, fontSize: FontSize.xs },
  spotActions: { flexDirection: 'row', gap: Spacing.xs, marginLeft: Spacing.sm },
  actionBtn: { padding: Spacing.sm },
  editIcon: { fontSize: 18 },
  deleteIcon: { fontSize: 18 },
  // モーダル
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancelText: { color: Colors.accent, fontSize: FontSize.md },
  modalTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  formContent: { padding: Spacing.lg, gap: Spacing.xs },
  formLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.sm },
  formMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginBottom: Spacing.xs },
  textInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  optionBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  optionBtnTextActive: { color: Colors.white, fontWeight: '700' },
  submitBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
});
