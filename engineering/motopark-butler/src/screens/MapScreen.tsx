import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Platform,
  SafeAreaView,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { ParkingPin, UserCC } from '../types';
import { ADACHI_PARKING, filterByCC } from '../data/adachi-parking';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

// 足立区中心
const ADACHI_CENTER: Region = {
  latitude: 35.7750,
  longitude: 139.8046,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const CC_OPTIONS: { value: UserCC; label: string; sub: string }[] = [
  { value: 50,  label: '原付',      sub: '50cc以下' },
  { value: 125, label: '125cc',     sub: '小型二輪' },
  { value: 250, label: '250cc',     sub: '軽二輪' },
  { value: 400, label: '400cc〜',   sub: '普通二輪+' },
];

function markerColor(spot: ParkingPin): string {
  if (spot.maxCC === null) return Colors.accent;   // オレンジ = 制限なし（全CC可）
  if (spot.maxCC >= 250)  return '#4CAF50';        // 緑 = 250cc以下OK
  if (spot.maxCC >= 125)  return '#2196F3';        // 青 = 125cc以下OK
  return '#9E9E9E';                                // グレー = 原付のみ
}

function ccLabel(maxCC: number | null): string {
  if (maxCC === null) return '制限なし';
  if (maxCC === 50)   return '原付のみ';
  if (maxCC === 125)  return '〜125cc';
  if (maxCC === 250)  return '〜250cc';
  return `〜${maxCC}cc`;
}

interface Props {
  userCC: UserCC;
  onOpenMyBike: () => void;
}

export function MapScreen({ userCC, onOpenMyBike }: Props) {
  const mapRef = useRef<MapView>(null);
  const [spots, setSpots] = useState<ParkingPin[]>([]);
  const [selected, setSelected] = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);

  useEffect(() => {
    const filtered = filterByCC(ADACHI_PARKING, userCC);
    setSpots(filtered);
  }, [userCC]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }, 800);
      }
    })();
  }, []);

  const goToCurrentLocation = async () => {
    if (!locationGranted) return;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    mapRef.current?.animateToRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    }, 600);
  };

  const openMaps = (spot: ParkingPin) => {
    const url = Platform.select({
      ios: `maps://app?daddr=${spot.latitude},${spot.longitude}`,
      android: `google.navigation:q=${spot.latitude},${spot.longitude}`,
    }) ?? `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}&travelmode=driving`);
    });
  };

  const currentOption = CC_OPTIONS.find(o => o.value === userCC)!;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={ADACHI_CENTER}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            onPress={() => setSelected(spot)}
            pinColor={markerColor(spot)}
          >
            <View style={[styles.pin, { backgroundColor: markerColor(spot) }]}>
              <Text style={styles.pinText}>🅿</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* 現在のフィルター表示 + マイバイク設定ボタン */}
      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.filterBar}>
          <View style={styles.filterInfo}>
            <Text style={styles.filterLabel}>
              {currentOption.label}
              <Text style={styles.filterSub}> ({currentOption.sub})</Text>
            </Text>
            <Text style={styles.filterCount}>{spots.length}件表示中</Text>
          </View>
          <TouchableOpacity style={styles.filterChangeBtn} onPress={onOpenMyBike}>
            <Text style={styles.filterChangeBtnText}>変更</Text>
          </TouchableOpacity>
        </View>

        {/* 凡例 */}
        <View style={styles.legend}>
          <LegendDot color={Colors.accent}  label="制限なし" />
          <LegendDot color="#4CAF50"        label="〜250cc" />
          <LegendDot color="#2196F3"        label="〜125cc" />
          <LegendDot color="#9E9E9E"        label="原付のみ" />
        </View>
      </SafeAreaView>

      {/* 現在地ボタン */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={goToCurrentLocation}>
          <Text style={styles.fabIcon}>◎</Text>
        </TouchableOpacity>
      </View>

      {/* 駐輪場詳細モーダル */}
      {selected && (
        <Modal
          transparent
          animationType="slide"
          visible={!!selected}
          onRequestClose={() => setSelected(null)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSelected(null)}
          >
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHandle} />

              <Text style={styles.sheetName}>{selected.name}</Text>

              <View style={styles.sheetBadgeRow}>
                <View style={[styles.sheetBadge, { backgroundColor: markerColor(selected) }]}>
                  <Text style={styles.sheetBadgeText}>{ccLabel(selected.maxCC)}</Text>
                </View>
                {selected.isFree === true && (
                  <View style={[styles.sheetBadge, { backgroundColor: Colors.success }]}>
                    <Text style={styles.sheetBadgeText}>無料</Text>
                  </View>
                )}
                {selected.isFree === false && (
                  <View style={[styles.sheetBadge, styles.sheetBadgeMuted]}>
                    <Text style={styles.sheetBadgeTextMuted}>有料</Text>
                  </View>
                )}
              </View>

              {selected.capacity != null && (
                <Text style={styles.sheetMeta}>収容台数: {selected.capacity}台</Text>
              )}

              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => openMaps(selected)}
                activeOpacity={0.85}
              >
                <Text style={styles.navBtnText}>Googleマップで案内を開始 →</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeBtnText}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  filterInfo: {
    flex: 1,
  },
  filterLabel: {
    color: Colors.accent,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  filterSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '400',
  },
  filterCount: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  filterChangeBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  filterChangeBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    backgroundColor: 'rgba(13,13,13,0.85)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    alignSelf: 'flex-start',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
  },
  fabContainer: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: 100,
    gap: Spacing.sm,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  fabIcon: {
    color: Colors.accent,
    fontSize: 22,
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  pinText: {
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  sheetName: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  sheetBadgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sheetBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  sheetBadgeMuted: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetBadgeText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  sheetBadgeTextMuted: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  sheetMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  navBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  navBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
});
