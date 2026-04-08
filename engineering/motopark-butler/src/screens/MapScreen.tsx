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

const CC_OPTIONS: { value: UserCC; label: string; sub: string }[] = [
  { value: 50,  label: '原付',    sub: '50cc以下' },
  { value: 125, label: '125cc',   sub: '小型二輪' },
  { value: 250, label: '250cc',   sub: '軽二輪' },
  { value: 400, label: '400cc〜', sub: '普通二輪+' },
];

function markerColor(spot: ParkingPin): string {
  if (spot.source === 'user') return '#9C27B0';
  if (spot.maxCC === null) return Colors.accent;
  if (spot.maxCC >= 250)   return '#4CAF50';
  if (spot.maxCC >= 125)   return '#2196F3';
  return '#9E9E9E';
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  userCC: UserCC;
  onOpenMyBike: () => void;
  focusSpot?: ParkingPin | null;
  onFocusConsumed?: () => void;
}

export function MapScreen({ userCC, onOpenMyBike, focusSpot, onFocusConsumed }: Props) {
  const mapRef = useRef<MapView>(null);
  const [seedSpots, setSeedSpots] = useState<ParkingPin[]>([]);
  const [userSpots, setUserSpots] = useState<ParkingPin[]>([]);
  const [selected, setSelected] = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favLoading, setFavLoading] = useState(false);
  const [myRating, setMyRating] = useState<number | null>(null);
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

  // お気に入りからのジャンプ
  useEffect(() => {
    if (!focusSpot) return;
    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: focusSpot.latitude,
        longitude: focusSpot.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 800);
      setTimeout(() => setSelected(focusSpot), 900);
    }, 400);
    onFocusConsumed?.();
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
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${spot.latitude},${spot.longitude}&directionsmode=driving`,
      android: `google.navigation:q=${spot.latitude},${spot.longitude}`,
    }) ?? `https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}&travelmode=driving`);
    });
  };

  const openYahooNavi = (spot: ParkingPin) => {
    const name = encodeURIComponent(spot.name);
    const lat = spot.latitude;
    const lon = spot.longitude;
    // Yahoo!カーナビ app deep link
    const deepLink = `yjnavicar://v1/map?lat=${lat}&lon=${lon}&name=${name}`;
    // Web fallback: Yahoo!カーナビ web (car navigation)
    const webFallback = `https://map.yahoo.co.jp/app/navi?lat=${lat}&lon=${lon}&name=${name}`;
    Linking.canOpenURL(deepLink)
      .then((supported) => {
        Linking.openURL(supported ? deepLink : webFallback).catch(() =>
          Linking.openURL(webFallback)
        );
      })
      .catch(() => Linking.openURL(webFallback));
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

  const currentOption = CC_OPTIONS.find((o) => o.value === userCC)!;
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
              <Text style={styles.pinText}>{spot.source === 'user' ? '★' : '🅿'}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* フィルター */}
      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.filterBar}>
          <View style={styles.filterInfo}>
            <Text style={styles.filterLabel}>
              {currentOption.label}
              <Text style={styles.filterSub}> ({currentOption.sub})</Text>
            </Text>
            <Text style={styles.filterCount}>{allSpots.length}件表示中</Text>
          </View>
          <TouchableOpacity style={styles.filterChangeBtn} onPress={onOpenMyBike}>
            <Text style={styles.filterChangeBtnText}>変更</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.legend}>
          <LegendDot color={Colors.accent} label="制限なし" />
          <LegendDot color="#4CAF50"       label="〜250cc" />
          <LegendDot color="#2196F3"       label="〜125cc" />
          <LegendDot color="#9E9E9E"       label="原付のみ" />
          <LegendDot color="#9C27B0"       label="登録" />
        </View>
      </SafeAreaView>

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={goToNearestSpot}>
          <Text style={styles.fabIcon}>🎯</Text>
        </TouchableOpacity>
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

              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetName}>{selected.name}</Text>
                <TouchableOpacity
                  style={styles.favBtn}
                  onPress={() => toggleFavorite(selected)}
                  disabled={favLoading}
                >
                  <Text style={styles.favBtnIcon}>
                    {favoriteIds.has(`${selected.source}_${selected.id}`) ? '♥' : '♡'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sheetBadgeRow}>
                {selected.source === 'user' && (
                  <View style={[styles.sheetBadge, { backgroundColor: '#9C27B0' }]}>
                    <Text style={styles.sheetBadgeText}>ユーザー登録</Text>
                  </View>
                )}
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
                <Text style={styles.navBtnText}>案内開始 →</Text>
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
          <Text style={[starStyles.star, value !== null && star <= value && starStyles.starFilled]}>
            {value !== null && star <= value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  starBtn: {
    padding: 4,
  },
  star: {
    fontSize: 28,
    color: Colors.border,
  },
  starFilled: {
    color: '#FFB300',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  filterInfo: { flex: 1 },
  filterLabel: { color: Colors.accent, fontSize: FontSize.md, fontWeight: '700' },
  filterSub: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '400' },
  filterCount: { color: Colors.textSecondary, fontSize: FontSize.xs },
  filterChangeBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  filterChangeBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: '700' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(13,13,13,0.85)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    alignSelf: 'flex-start',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: Colors.textSecondary, fontSize: 10 },
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
  fabIcon: { color: Colors.accent, fontSize: 22 },
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
  pinText: { fontSize: 16 },
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
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetName: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  favBtn: { padding: Spacing.sm },
  favBtnIcon: { fontSize: 28, color: '#E91E63' },
  sheetBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  sheetBadge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  sheetBadgeMuted: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  sheetBadgeText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: '700' },
  sheetBadgeTextMuted: { color: Colors.textSecondary, fontSize: FontSize.sm },
  sheetMeta: { color: Colors.textSecondary, fontSize: FontSize.sm },
  ratingSection: { gap: Spacing.xs },
  ratingLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  navBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  navBtnText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  closeBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  closeBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
});
