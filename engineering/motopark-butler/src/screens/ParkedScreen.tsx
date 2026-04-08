import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface Props {
  onBack: () => void;
}

interface SavedLocation {
  latitude: number;
  longitude: number;
  address: string;
  savedAt: string;
}

export function ParkedScreen({ onBack }: Props) {
  const [saved, setSaved] = useState<SavedLocation | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('許可が必要です', '位置情報の許可を設定から有効にしてください。');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const address = geo
        ? [geo.region, geo.city, geo.street, geo.streetNumber]
            .filter(Boolean)
            .join(' ')
        : `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`;

      setSaved({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address,
        savedAt: new Date().toLocaleString('ja-JP'),
      });
    } catch {
      Alert.alert('エラー', '位置情報の取得に失敗しました。');
    }
    setLoading(false);
  };

  const handleClear = () => {
    Alert.alert('クリア確認', '駐車場所の記録を消しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'クリア', style: 'destructive', onPress: () => setSaved(null) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📍 駐めた場所</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {saved ? (
          <View style={styles.savedCard}>
            <Text style={styles.savedIcon}>📍</Text>
            <Text style={styles.savedAddress}>{saved.address}</Text>
            <Text style={styles.savedTime}>記録時刻: {saved.savedAt}</Text>
            <Text style={styles.savedCoords}>
              {saved.latitude.toFixed(5)}, {saved.longitude.toFixed(5)}
            </Text>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>🗑️ クリア</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🅿️</Text>
            <Text style={styles.emptyText}>駐車場所が記録されていません</Text>
            <Text style={styles.emptyHint}>
              バイクを駐めたら下のボタンで現在地を記録してください
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.recordBtn, loading && styles.recordBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.recordBtnText}>📍 ここに駐めた！</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    minWidth: 60,
  },
  backText: {
    color: Colors.accent,
    fontSize: FontSize.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'space-between',
  },
  savedCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
    gap: Spacing.sm,
  },
  savedIcon: {
    fontSize: 48,
  },
  savedAddress: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  savedTime: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  savedCoords: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontFamily: 'monospace',
  },
  clearBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  clearBtnText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 64,
  },
  emptyText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  emptyHint: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  recordBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  recordBtnDisabled: {
    opacity: 0.6,
  },
  recordBtnText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
});
