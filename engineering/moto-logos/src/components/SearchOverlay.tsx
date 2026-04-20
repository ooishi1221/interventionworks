/**
 * SearchOverlay — 未来検索のフルスクリーン入力画面
 *
 * ピルバーの🔍タップで開く。
 * テキスト入力 → ジオコーディング → 座標 + エリア名を返す。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  FlatList,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import {
  autocompletePlaces,
  getPlaceDetails,
  generateSessionToken,
  type PlaceSuggestion,
} from '../utils/placesApi';
import { getCachedPlace, cachePlace } from '../utils/placesCache';
import { captureError } from '../utils/sentry';

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
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const sessionTokenRef = useRef<string>(generateSessionToken());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setSuggestions([]);
      sessionTokenRef.current = generateSessionToken();
      loadHistory().then(setHistory);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible]);

  // デバウンス付き autocomplete
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const q = text.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setAutocompleteLoading(false);
      return;
    }
    setAutocompleteLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await autocompletePlaces(q, sessionTokenRef.current);
        setSuggestions(result);
      } catch (e) {
        captureError(e, { context: 'places_autocomplete' });
        setSuggestions([]);
      } finally {
        setAutocompleteLoading(false);
      }
    }, 300);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [text]);

  // 候補選択 → 座標取得
  const pickSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      Keyboard.dismiss();
      setSearching(true);
      try {
        const details = await getPlaceDetails(
          suggestion.placeId,
          sessionTokenRef.current,
        );
        const query = suggestion.primaryText || suggestion.fullText;
        saveToHistory(query);
        // API 節約のためキャッシュに保存（次回同じクエリは即応答）
        cachePlace({
          query,
          placeId: suggestion.placeId,
          latitude: details.latitude,
          longitude: details.longitude,
          name: details.name || suggestion.primaryText,
        }).catch(() => { /* cache 失敗は致命的ではない */ });

        onSearchResult({
          latitude: details.latitude,
          longitude: details.longitude,
          areaName: query || details.name,
        });
        // セッション終了 → 次のセッション用にトークンを更新
        sessionTokenRef.current = generateSessionToken();
      } catch (e) {
        captureError(e, { context: 'places_details' });
        Alert.alert('エラー', '場所の詳細取得に失敗しました。');
      } finally {
        setSearching(false);
      }
    },
    [onSearchResult],
  );

  // Enter / 候補が1件のみ → 先頭候補を選択
  const handleSubmit = async () => {
    if (suggestions.length > 0) {
      pickSuggestion(suggestions[0]);
      return;
    }
    // 候補0件の場合は expo-location フォールバック
    const q = text.trim();
    if (!q) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        Alert.alert('見つかりませんでした', `「${q}」に該当する場所が見つかりません。`);
        return;
      }
      const { latitude, longitude } = results[0];
      let areaName = q;
      try {
        const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverse.length > 0) {
          const r = reverse[0];
          areaName = r.district || r.city || r.region || q;
        }
      } catch { /* ignore */ }
      saveToHistory(q);
      onSearchResult({ latitude, longitude, areaName });
    } catch {
      Alert.alert('エラー', '検索に失敗しました。');
    } finally {
      setSearching(false);
    }
  };

  // チップタップ → キャッシュがあれば即移動。なければ Autocomplete で
  // 先頭候補を取得して自動ジャンプ。候補0件なら expo-location へフォールバック。
  const handleChipPress = useCallback(
    async (label: string) => {
      Keyboard.dismiss();
      // 1) キャッシュ: API 0回で即ジャンプ
      const cached = await getCachedPlace(label);
      if (cached) {
        saveToHistory(label);
        onSearchResult({
          latitude: cached.latitude,
          longitude: cached.longitude,
          areaName: label,
        });
        return;
      }
      // 2) キャッシュなし: Autocomplete で先頭候補取得 → Details → 即ジャンプ
      setSearching(true);
      const token = generateSessionToken();
      sessionTokenRef.current = token;
      try {
        const picks = await autocompletePlaces(label, token);
        if (picks.length > 0) {
          const first = picks[0];
          const details = await getPlaceDetails(first.placeId, token);
          saveToHistory(label);
          cachePlace({
            query: label,
            placeId: first.placeId,
            latitude: details.latitude,
            longitude: details.longitude,
            name: details.name || first.primaryText,
          }).catch(() => { /* cache 失敗は致命的ではない */ });
          onSearchResult({
            latitude: details.latitude,
            longitude: details.longitude,
            areaName: label,
          });
          sessionTokenRef.current = generateSessionToken();
          return;
        }
        // 3) Autocomplete 0件: expo-location フォールバック
        const geo = await Location.geocodeAsync(label);
        if (geo.length > 0) {
          saveToHistory(label);
          onSearchResult({
            latitude: geo[0].latitude,
            longitude: geo[0].longitude,
            areaName: label,
          });
          return;
        }
        Alert.alert('見つかりませんでした', `「${label}」に該当する場所が見つかりません。`);
      } catch (e) {
        captureError(e, { context: 'chip_press' });
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('検索エラー詳細', `[${label}]\n${msg.slice(0, 300)}`);
      } finally {
        setSearching(false);
      }
    },
    [onSearchResult],
  );

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

        {/* Autocomplete 候補リスト */}
        {!searching && text.length > 0 && (
          <View style={s.suggestionsPanel}>
            {autocompleteLoading && suggestions.length === 0 && (
              <View style={s.suggestionLoading}>
                <ActivityIndicator size="small" color={C.blue} />
              </View>
            )}
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.placeId}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.suggestionRow}
                  onPress={() => pickSuggestion(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={18} color={C.sub} />
                  <View style={s.suggestionText}>
                    <Text style={s.suggestionPrimary} numberOfLines={1}>
                      {item.primaryText || item.fullText}
                    </Text>
                    {item.secondaryText ? (
                      <Text style={s.suggestionSecondary} numberOfLines={1}>
                        {item.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={s.suggestionSep} />}
            />
          </View>
        )}

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
  suggestionsPanel: {
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: 'rgba(28,28,30,0.98)',
    borderRadius: 14,
    maxHeight: 360,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  suggestionLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionPrimary: {
    color: C.text,
    fontSize: 15,
    fontWeight: '500',
  },
  suggestionSecondary: {
    color: C.sub,
    fontSize: 12,
    marginTop: 2,
  },
  suggestionSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 44,
  },
});
