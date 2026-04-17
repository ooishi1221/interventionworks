/**
 * MyBikeScreen v2 — 愛車プロフィール
 *
 * CC選択 + メーカー・車種・年式・カラー・写真・ひとこと
 * 保存時にSQLite + Firestoreに同期
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserCC, Vehicle } from '../types';
import { Colors, Spacing, FontSize } from '../constants/theme';
import { getFirstVehicle, insertVehicle, updateVehicle } from '../db/database';
import { syncBikeToFirestore } from '../firebase/firestoreService';
import { captureError } from '../utils/sentry';
import { pickPhotoFromCamera, pickPhotoFromLibrary } from '../utils/photoPicker';
import { useUser } from '../contexts/UserContext';

const C = { ...Colors, orange: Colors.accent };

const CC_OPTIONS: { value: UserCC; label: string; color: string }[] = [
  { value: 50,   label: '原付',  color: '#8E8E93' },
  { value: 125,  label: '125cc', color: '#30D158' },
  { value: 400,  label: '400cc', color: '#0A84FF' },
  { value: null,  label: '大型',  color: '#FF9F0A' },
];

interface Props {
  userCC: UserCC;
  onChangeCC: (cc: UserCC) => void;
  onBack: () => void;
}

export function MyBikeScreen({ userCC, onChangeCC, onBack }: Props) {
  const user = useUser();
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [tagline, setTagline] = useState('');
  const [existingId, setExistingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // 既存データ読み込み
  useEffect(() => {
    getFirstVehicle().then((v) => {
      if (v) {
        setExistingId(v.id);
        setName(v.name || '');
        setManufacturer(v.manufacturer || '');
        setModel(v.model || '');
        setYear(v.year ? String(v.year) : '');
        setColor(v.color || '');
        setPhotoUri(v.photoUrl || null);
        setTagline(v.tagline || '');
      }
    });
  }, []);

  const pickPhoto = () => {
    Alert.alert('愛車の写真', '', [
      { text: 'アルバムから選ぶ', onPress: async () => { const uri = await pickPhotoFromLibrary(); if (uri) setPhotoUri(uri); } },
      { text: '撮影する',        onPress: async () => { const uri = await pickPhotoFromCamera();   if (uri) setPhotoUri(uri); } },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    const bikeName = name.trim() || `${manufacturer} ${model}`.trim() || '愛車';
    setSaving(true);
    try {
      const vehicleData: Omit<Vehicle, 'id' | 'createdAt'> = {
        name: bikeName,
        type: 'motorcycle',
        cc: userCC,
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        year: year ? parseInt(year, 10) : undefined,
        color: color.trim() || undefined,
        photoUrl: photoUri ?? undefined,
        tagline: tagline.trim() || undefined,
      };

      if (existingId) {
        await updateVehicle(existingId, vehicleData);
      } else {
        const result = await insertVehicle(vehicleData);
        setExistingId(result.lastInsertRowId);
      }

      // Firestore同期
      if (user?.userId) {
        syncBikeToFirestore(user.userId, vehicleData).catch((e) => captureError(e, { context: 'syncBike' }));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onBack();
    } catch (e) {
      captureError(e, { context: 'saveBike' });
      Alert.alert('保存に失敗しました');
    }
    setSaving(false);
  };

  return (
    <View style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>マイバイク</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[s.saveBtn, saving && { opacity: 0.5 }]}>
            {saving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* 写真 */}
        <TouchableOpacity style={s.photoArea} onPress={pickPhoto} activeOpacity={0.8}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={s.photo} />
          ) : (
            <View style={s.photoPlaceholder}>
              <Ionicons name="images" size={32} color={C.sub} />
              <Text style={s.photoText}>愛車の写真を追加</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ひとこと */}
        <TextInput
          style={s.taglineInput}
          placeholder="ひとこと（例: 日本一周中）"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={tagline}
          onChangeText={setTagline}
          maxLength={30}
        />

        {/* 排気量 */}
        <Text style={s.sectionTitle}>排気量</Text>
        <View style={s.ccRow}>
          {CC_OPTIONS.map((opt) => {
            const active = userCC === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={[s.ccChip, active && { backgroundColor: `${opt.color}20`, borderColor: opt.color }]}
                onPress={() => { onChangeCC(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.7}
              >
                <Text style={[s.ccChipText, active && { color: opt.color, fontWeight: '800' }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 車両情報 */}
        <Text style={s.sectionTitle}>車両情報</Text>
        <View style={s.formCard}>
          <FormRow label="車名" placeholder="例: CBR650R" value={name} onChangeText={setName} />
          <View style={s.separator} />
          <FormRow label="メーカー" placeholder="例: Honda" value={manufacturer} onChangeText={setManufacturer} />
          <View style={s.separator} />
          <FormRow label="車種" placeholder="例: ネイキッド" value={model} onChangeText={setModel} />
          <View style={s.separator} />
          <FormRow label="年式" placeholder="例: 2024" value={year} onChangeText={setYear} keyboardType="numeric" />
          <View style={s.separator} />
          <FormRow label="カラー" placeholder="例: レッド" value={color} onChangeText={setColor} />
        </View>
      </ScrollView>
    </View>
  );
}

function FormRow({ label, placeholder, value, onChangeText, keyboardType }: {
  label: string; placeholder: string; value: string;
  onChangeText: (t: string) => void; keyboardType?: 'numeric' | 'default';
}) {
  return (
    <View style={s.formRow}>
      <Text style={s.formLabel}>{label}</Text>
      <TextInput
        style={s.formInput}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.2)"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Constants.statusBarHeight },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  backBtn: { width: 32 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  saveBtn: { color: C.orange, fontSize: 16, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 60 },

  // Photo
  photoArea: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  photo: { width: '100%', height: 200, borderRadius: 16 },
  photoPlaceholder: {
    width: '100%', height: 200, borderRadius: 16,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
  },
  photoText: { color: C.sub, fontSize: 13 },

  // Tagline
  taglineInput: {
    backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: 20,
  },

  // CC
  sectionTitle: { color: C.sub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  ccRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  ccChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.border,
  },
  ccChipText: { color: C.sub, fontSize: 14, fontWeight: '600' },

  // Form
  formCard: {
    backgroundColor: C.card, borderRadius: 14, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  formRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  formLabel: { color: C.sub, fontSize: 14, width: 70 },
  formInput: { flex: 1, color: C.text, fontSize: 15, textAlign: 'right' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 16 },
});
