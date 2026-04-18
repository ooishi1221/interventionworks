/**
 * SearchOverlay — 未来検索のフルスクリーン入力画面
 *
 * ピルバーの🔍タップで開く。
 * テキスト入力 → ジオコーディング → 座標 + エリア名を返す。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const C = Colors;

const HISTORY_KEY = 'moto_logos_search_history';
const MAX_HISTORY = 5;

const HOT_AREAS = ['渋谷', '新宿', '秋葉原', '池袋', '上野', '代官山', 'お台場', '横浜', '川崎', '品川'];

async function loadHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveToHistory(query: string): Promise<void> {
  const history = await loadHistory();
  const filtered = history.filter(h => h !== query);
  const updated = [query, ...filtered].slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

export interface SearchResult {
  latitude: number;
  longitude: number;
  areaName: string;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSearchResult: (result: SearchResult) => void;
}

export function SearchOverlay({ visible, onDismiss, onSearchResult }: Props) {
  const [text, setText] = useState('');
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      loadHistory().then(setHistory);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible]);

  const handleSubmit = async () => {
    const q = text.trim();
    if (!q) return;

    Keyboard.dismiss();
    setSearching(true);

    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        Alert.alert('見つかりませんでした', `「${q}」に該当する場所が見つかりません。`);
        setSearching(false);
        return;
      }

      const { latitude, longitude } = results[0];

      // エリア名を取得
      let areaName = q;
      try {
        const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverse.length > 0) {
          const r = reverse[0];
          // district > city > region の優先順でエリア名を決定
          areaName = r.district || r.city || r.region || q;
        }
      } catch {
        // reverseGeocode失敗時は入力テキストをそのまま使う
      }

      saveToHistory(q);
      onSearchResult({ latitude, longitude, areaName });
    } catch {
      Alert.alert('エラー', '検索に失敗しました。');
    }
    setSearching(false);
  };

  const handleChipPress = (label: string) => {
    setText(label);
    Keyboard.dismiss();
    // 直接検索実行
    setSearching(true);
    Location.geocodeAsync(label).then(async (results) => {
      if (results.length === 0) {
        Alert.alert('見つかりませんでした', `「${label}」に該当する場所が見つかりません。`);
        setSearching(false);
        return;
      }
      const { latitude, longitude } = results[0];
      let areaName = label;
      try {
        const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverse.length > 0) {
          const r = reverse[0];
          areaName = r.district || r.city || r.region || label;
        }
      } catch { /* fallback to label */ }
      saveToHistory(label);
      onSearchResult({ latitude, longitude, areaName });
      setSearching(false);
    }).catch(() => {
      Alert.alert('エラー', '検索に失敗しました。');
      setSearching(false);
    });
  };

  if (!visible) return null;

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.container}
      >
        {/* 検索バー */}
        <View style={s.barRow}>
          <View style={s.bar}>
            <Ionicons name="search" size={16} color={C.sub} />
            <TextInput
              ref={inputRef}
              style={s.input}
              placeholder="どこへ走る？"
              placeholderTextColor={C.sub}
              value={text}
              onChangeText={setText}
              returnKeyType="search"
              onSubmitEditing={handleSubmit}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching ? (
              <ActivityIndicator size="small" color={C.blue} />
            ) : text.length > 0 ? (
              <TouchableOpacity onPress={() => setText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={20} color={C.sub} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={s.cancelText}>閉じる</Text>
          </TouchableOpacity>
        </View>

        {/* チップ（履歴 + ホットエリア） */}
        {!searching && text.length === 0 && (
          <ScrollView style={s.chipScroll} keyboardShouldPersistTaps="handled">
            {history.length > 0 && (
              <>
                <Text style={s.chipSectionTitle}>最近の検索</Text>
                <View style={s.chipRow}>
                  {history.map((h) => (
                    <TouchableOpacity key={h} style={s.chip} onPress={() => handleChipPress(h)} activeOpacity={0.7}>
                      <Ionicons name="time-outline" size={14} color={C.sub} />
                      <Text style={s.chipText}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={s.chipSectionTitle}>人気エリア</Text>
            <View style={s.chipRow}>
              {HOT_AREAS.map((area) => (
                <TouchableOpacity key={area} style={s.chip} onPress={() => handleChipPress(area)} activeOpacity={0.7}>
                  <Ionicons name="flame-outline" size={14} color={C.accent} />
                  <Text style={s.chipText}>{area}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* 暗幕タップで閉じる */}
        <TouchableOpacity style={s.backdrop} onPress={onDismiss} activeOpacity={1} />
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 12,
    gap: 8,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,30,0.94)',
    borderRadius: 14,
    height: 44,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  cancelText: {
    color: C.blue,
    fontSize: 15,
    fontWeight: '500',
  },
  chipScroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
    maxHeight: 300,
  },
  chipSectionTitle: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
  },
});
