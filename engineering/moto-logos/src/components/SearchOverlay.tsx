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
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const C = Colors;

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
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
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

      onSearchResult({ latitude, longitude, areaName });
    } catch {
      Alert.alert('エラー', '検索に失敗しました。');
    }
    setSearching(false);
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

        {/* ヒント */}
        {!searching && text.length === 0 && (
          <View style={s.hints}>
            <Text style={s.hintTitle}>駅名・地名・施設名で検索</Text>
            <Text style={s.hintExample}>例: 渋谷、東京ドーム、箱根</Text>
          </View>
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
  hints: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  hintTitle: {
    color: C.sub,
    fontSize: 14,
    fontWeight: '600',
  },
  hintExample: {
    color: C.sub,
    fontSize: 13,
    marginTop: 6,
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
  },
});
