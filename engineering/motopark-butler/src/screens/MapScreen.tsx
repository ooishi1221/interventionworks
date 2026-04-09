import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, UserCC, UserSpot } from '../types';
import { ADACHI_PARKING, filterByCC } from '../data/adachi-parking';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import {
  getAllUserSpots,
  addFavorite,
  removeFavorite,
  getAllFavorites,
  getRating,
  setRating,
} from '../db/database';

const ADACHI_CENTER: Region = {
  latitude: 35.7750,
  longitude: 139.8046,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const CC_SEGMENTS: { value: UserCC; label: string }[] = [
  { value: 50,  label: '原付'   },
  { value: 125, label: '125cc' },
  { value: 250, label: '250cc' },
  { value: 400, label: '400cc+' },
];

// iOS dark mode system colors
const SYS_BLUE   = '#0A84FF';
const SYS_GRAY   = '#636366';
const FAB_BG     = 'rgba(44,44,46,0.92)';
const SEG_BG     = 'rgba(44,44,46,0.90)';
const SEG_ACTIVE = 'rgba(255,255,255,0.16)';

function markerColor(spot: ParkingPin): string {
  if (spot.source === 'user') return '#BF5AF2';
  if (spot.maxCC === null)    return SYS_BLUE;
  if (spot.maxCC >= 250)     return '#30D158';
  if (spot.maxCC >= 125)     return '#0A84FF';
  return '#8E8E93';
}

function ccLabel(maxCC: number | null): string {
  if (maxCC === null) return '制限なし';
  if (maxCC === 50)   return '原付のみ';
  if (maxCC === 125)  return '〜125cc';
  if (maxCC === 250)  return '〜250cc';
  return `〜${maxCC}cc`;
}

function userSpotToPin(spot: UserSpot): ParkingPin {
  return {
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
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  userCC: UserCC;
  onOpenMyBike: () => void;
  onChangeCC?: (cc: UserCC) => void;
  focusSpot?: ParkingPin | null;
  onFocusConsumed?: () => void;
}

export function MapScreen({ userCC, onOpenMyBike, onChangeCC, focusSpot, onFocusConsumed }: Props) {
  const mapRef = useRef<MapView>(null);
  const [seedSpots, setSeedSpots]         = useState<ParkingPin[]>([]);
  const [userSpots, setUserSpots]         = useState<ParkingPin[]>([]);
  const [selected, setSelected]           = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [favoriteIds, setFavoriteIds]     = useState<Set<string>>(new Set());
  const [favLoading, setFavLoading]       = useState(false);
  const [myRating, setMyRating]           = useState<number | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    const favs = await getAllFavorites();
    setFavoriteIds(new Set(favs.map((f) => `${f.source}_${f.spotId}`)));
  }, []);

  const loadUserSpots = useCallback(async () => {
    const spots = await getAllUserSpots();
    setUserSpots(spots.map(userSpotToPin));
  }, []);

  useEffect(() => {
    setSeedSpots(filterByCC(ADACHI_PARKING, userCC));
  }, [userCC]);

  useEffect(() => {
    loadUserSpots();
    loadFavorites();
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        mapRef.current?.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }, 800);
      }
    })();
  }, []);

  // お気に入りからのジャンプ（修正済み：タイマーキャンセルバグを解消）
  useEffect(() => {
    if (!focusSpot) return;
    const spot = focusSpot; // クロージャでキャプチャしてから親のstateをリセット可能にする
    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: spot.latitude,
        longitude: spot.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 800);
      setTimeout(() => setSelected(spot), 900);
      // タイマー起動後に呼ぶことで、クリーンアップによるタイマーキャンセルを防ぐ
      onFocusConsumed?.();
    }, 400);
    return () => clearTimeout(timer);
  }, [focusSpot]);

  // 選択スポット変更時にレーティング読み込み
  useEffect(() => {
    if (!selected) { setMyRating(null); return; }
    getRating(selected.id, selected.source as 'seed' | 'user').then(setMyRating);
  }, [selected]);

  const goToCurrentLocation = async () => {
    if (!locationGranted) return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    }, 600);
  };

  const goToNearestSpot = async () => {
    if (!locationGranted) {
      Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = loc.coords;
    const all = [...seedSpots, ...userSpots];
    if (all.length === 0) return;

    let nearest = all[0];
    let minDist = haversineMeters(latitude, longitude, nearest.latitude, nearest.longitude);
    for (const spot of all.slice(1)) {
      const d = haversineMeters(latitude, longitude, spot.latitude, spot.longitude);
      if (d < minDist) { minDist = d; nearest = spot; }
    }

    mapRef.current?.animateToRegion({
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 800);
    setTimeout(() => setSelected(nearest), 900);
  };

  const openGoogleMaps = (spot: ParkingPin) => {
    const url =
      Platform.select({
        ios:     `comgooglemaps://?daddr=${spot.latitude},${spot.longitude}&directionsmode=driving`,
        android: `google.navigation:q=${spot.latitude},${spot.longitude}`,
      }) ?? `https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}&travelmode=driving`)
    );
  };

  const openYahooNavi = async (spot: ParkingPin) => {
    const name = encodeURIComponent(spot.name);
    const lat  = spot.latitude;
    const lon  = spot.longitude;

    // 新スキーム（Yahoo!カーナビ最新版）→ 旧スキーム → Webフォールバックの順で試行
    const newDeepLink = `ynavigation://v1/route?lat=${lat}&lon=${lon}&name=${name}&type=drive`;
    const oldDeepLink = `yjnavicar://v1/map?lat=${lat}&lon=${lon}&name=${name}`;
    const webFallback = `https://map.yahoo.co.jp/app/navi?lat=${lat}&lon=${lon}&name=${name}`;

    try {
      if (await Linking.canOpenURL(newDeepLink)) {
        await Linking.openURL(newDeepLink);
        return;
      }
      if (await Linking.canOpenURL(oldDeepLink)) {
        await Linking.openURL(oldDeepLink);
        return;
      }
    } catch {}
    Linking.openURL(webFallback).catch(() => {});
  };

  const copyAddress = async (spot: ParkingPin) => {
    const text = spot.address
      ? `${spot.name}\n${spot.address}`
      : `${spot.name}\n${spot.latitude}, ${spot.longitude}`;
    await Clipboard.setStringAsync(text);
    Alert.alert('コピーしました', spot.address ?? `${spot.latitude}, ${spot.longitude}`);
  };

  const handleNavigation = (spot: ParkingPin) => {
    Alert.alert('案内開始', spot.name, [
      { text: 'Googleマップ',   onPress: () => openGoogleMaps(spot) },
      { text: 'Yahoo!カーナビ', onPress: () => openYahooNavi(spot) },
      { text: '住所をコピー',   onPress: () => copyAddress(spot) },
      { text: 'キャンセル',     style: 'cancel' },
    ]);
  };

  const toggleFavorite = async (spot: ParkingPin) => {
    setFavLoading(true);
    const key = `${spot.source}_${spot.id}`;
    try {
      if (favoriteIds.has(key)) {
        await removeFavorite(spot.id, spot.source as 'seed' | 'user');
        setFavoriteIds((prev) => { const n = new Set(prev); n.delete(key); return n; });
      } else {
        await addFavorite(spot.id, spot.source as 'seed' | 'user');
        setFavoriteIds((prev) => new Set(prev).add(key));
      }
    } catch {}
    setFavLoading(false);
  };

  const handleRate = async (spot: ParkingPin, score: number) => {
    setRatingLoading(true);
    try {
      await setRating(spot.id, spot.source as 'seed' | 'user', score);
      setMyRating(score);
    } catch {}
    setRatingLoading(false);
  };

  const handleSegmentPress = (value: UserCC) => {
    if (onChangeCC) {
      onChangeCC(value);
    } else {
      onOpenMyBike();
    }
  };

  const allSpots = [...seedSpots, ...userSpots];

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
        {allSpots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            onPress={() => setSelected(spot)}
          >
            <View style={[styles.pin, { backgroundColor: markerColor(spot) }]}>
              <Text style={styles.pinText}>{spot.source === 'user' ? '★' : 'P'}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* セグメントコントロール（CC フィルター） */}
      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.segmentedWrapper}>
          <View style={styles.segmentedControl}>
            {CC_SEGMENTS.map((seg) => {
              const isActive = userCC === seg.value;
              return (
                <TouchableOpacity
                  key={seg.value}
                  style={[styles.segment, isActive && styles.segmentActive]}
                  onPress={() => handleSegmentPress(seg.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                    {seg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.spotCount}>{allSpots.length}件</Text>
        </View>
      </SafeAreaView>

      {/* FABs — Apple Maps 風 */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={goToNearestSpot} activeOpacity={0.8}>
          <Ionicons name="locate" size={22} color={SYS_BLUE} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={goToCurrentLocation} activeOpacity={0.8}>
          <Ionicons name="navigate" size={20} color={SYS_BLUE} />
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

              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetName}>{selected.name}</Text>
                <TouchableOpacity
                  style={styles.favBtn}
                  onPress={() => toggleFavorite(selected)}
                  disabled={favLoading}
                >
                  <Ionicons
                    name={favoriteIds.has(`${selected.source}_${selected.id}`) ? 'heart' : 'heart-outline'}
                    size={26}
                    color="#FF375F"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.sheetBadgeRow}>
                {selected.source === 'user' && (
                  <View style={[styles.sheetBadge, { backgroundColor: '#BF5AF2' }]}>
                    <Text style={styles.sheetBadgeText}>ユーザー登録</Text>
                  </View>
                )}
                <View style={[styles.sheetBadge, { backgroundColor: markerColor(selected) }]}>
                  <Text style={styles.sheetBadgeText}>{ccLabel(selected.maxCC)}</Text>
                </View>
                {selected.isFree === true && (
                  <View style={[styles.sheetBadge, { backgroundColor: '#30D158' }]}>
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
              {selected.address && (
                <Text style={styles.sheetMeta}>{selected.address}</Text>
              )}

              {/* 星評価 */}
              <View style={styles.ratingSection}>
                <Text style={styles.ratingLabel}>
                  {myRating ? `あなたの評価: ${myRating}.0` : '評価する'}
                </Text>
                <StarRating
                  value={myRating}
                  onRate={(score) => handleRate(selected, score)}
                  disabled={ratingLoading}
                />
              </View>

              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => handleNavigation(selected)}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.navBtnText}>案内開始</Text>
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

function StarRating({
  value,
  onRate,
  disabled,
}: {
  value: number | null;
  onRate: (score: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !disabled && onRate(star)}
          activeOpacity={0.7}
          style={starStyles.starBtn}
        >
          <Ionicons
            name={value !== null && star <= value ? 'star' : 'star-outline'}
            size={28}
            color={value !== null && star <= value ? '#FFD60A' : Colors.border}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 4 },
  starBtn: { padding: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  // セグメントコントロール
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  segmentedWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: SEG_BG,
    borderRadius: 10,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: SEG_ACTIVE,
  },
  segmentText: {
    color: SYS_GRAY,
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  spotCount: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    right: Spacing.md,
    bottom: 100,
    gap: Spacing.sm,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: FAB_BG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },

  // マーカー
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  pinText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // モーダルシート
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetName: { color: '#F5F5F5', fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  favBtn:    { padding: Spacing.sm },
  sheetBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  sheetBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  sheetBadgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sheetBadgeText:     { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
  sheetBadgeTextMuted:{ color: '#8E8E93', fontSize: FontSize.sm },
  sheetMeta:          { color: '#8E8E93', fontSize: FontSize.sm },
  ratingSection:      { gap: Spacing.xs },
  ratingLabel:        { color: '#8E8E93', fontSize: FontSize.sm },
  navBtn: {
    backgroundColor: SYS_BLUE,
    borderRadius: 14,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
  navBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  closeBtn:   { alignItems: 'center', paddingVertical: Spacing.sm },
  closeBtnText: { color: '#8E8E93', fontSize: FontSize.sm },
});
