/**
 * RiderScreen v6 — ライダーノート
 *
 * ① バイク写真カード（タップで変更）
 * ② 排気量選択（4択）
 * ③ お気に入りTOP3（ワンショット数順）
 * ④ ワンショット履歴（3列グリッド）
 * ⑤ ワンショットマップ
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getFirstVehicle,
  getFootprints,
  getTopSpots,
  updateVehicle,
  type Footprint,
  type TopSpot,
} from '../db/database';
import { fetchUserPhotos, syncBikeToFirestore } from '../firebase/firestoreService';
import { useUser } from '../contexts/UserContext';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import { ParkingPin, Vehicle, Review, UserCC } from '../types';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { Colors } from '../constants/theme';
import { captureError } from '../utils/sentry';

const { width: SCREEN_W } = Dimensions.get('window');
const C = Colors;

const CC_OPTIONS: { value: UserCC; label: string }[] = [
  { value: 50, label: '50cc' },
  { value: 125, label: '125cc' },
  { value: 400, label: '400cc' },
  { value: null as unknown as UserCC, label: '大型' },
];

function formatOneshotTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  if (sameYear) return `${month}/${day} ${h}:${m}`;
  return `${d.getFullYear()}/${month}/${day} ${h}:${m}`;
}

const TOKYO_REGION: Region = {
  latitude: 35.6812,
  longitude: 139.7671,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

interface Props {
  onGoToSpot?: (spot: ParkingPin, reviewId?: string) => void;
  onDataChanged?: () => void;
  userCC?: UserCC;
  onChangeCC?: (cc: UserCC) => void;
  nickname?: string;
  onChangeNickname?: (name: string) => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, userCC, onChangeCC, nickname, onChangeNickname }: Props) {
  const user = useUser();
  const { showPicker, PickerSheet } = usePhotoPicker();
  const [bike, setBike] = useState<Vehicle | null>(null);
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const [myPhotos, setMyPhotos] = useState<Review[]>([]);
  const [topSpots, setTopSpots] = useState<TopSpot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [photoPage, setPhotoPage] = useState(1);
  const PHOTOS_PER_PAGE = 15; // 3×5

  const loadData = useCallback(async () => {
    const [vehicle, fp, tops] = await Promise.all([
      getFirstVehicle(),
      getFootprints(50),
      getTopSpots(3),
    ]);
    setBike(vehicle);
    setFootprints(fp);
    setTopSpots(tops);

    const uid = user?.userId;
    if (uid) {
      try {
        const photos = await fetchUserPhotos(uid);
        setMyPhotos(photos);
      } catch (e) {
        captureError(e, { context: 'fetch_user_photos' });
      }
    }
  }, [user?.userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // バイク写真変更
  const handleChangePhoto = useCallback(async () => {
    const uri = await showPicker();
    if (!uri || !bike) return;
    try {
      await updateVehicle(bike.id, { ...bike, photoUrl: uri });
      setBike({ ...bike, photoUrl: uri });
      const uid = user?.userId;
      if (uid) syncBikeToFirestore(uid, { ...bike, photoUrl: uri }).catch(() => {});
      onDataChanged?.();
    } catch (e) {
      captureError(e, { context: 'change_bike_photo' });
    }
  }, [bike, showPicker, user?.userId, onDataChanged]);

  // CC変更
  const handleChangeCC = useCallback(async (cc: UserCC) => {
    onChangeCC?.(cc);
    if (bike) {
      try {
        await updateVehicle(bike.id, { ...bike, cc });
        setBike({ ...bike, cc });
        const uid = user?.userId;
        if (uid) syncBikeToFirestore(uid, { ...bike, cc }).catch(() => {});
      } catch (e) {
        captureError(e, { context: 'change_cc' });
      }
    }
  }, [bike, onChangeCC, user?.userId]);

  // spotId → spotName
  const spotNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const fp of footprints) map.set(fp.spotId, fp.spotName);
    return map;
  }, [footprints]);

  // ワンショットポイント（写真付きレビューがあるスポットのみ）
  const oneshotLocations = useMemo(() => {
    const coordMap = new Map<string, { latitude: number; longitude: number; spotName: string }>();
    for (const fp of footprints) {
      if (!coordMap.has(fp.spotId)) {
        coordMap.set(fp.spotId, { latitude: fp.latitude, longitude: fp.longitude, spotName: fp.spotName });
      }
    }
    const photoSpotIds = new Set(myPhotos.filter(p => p.photoUri).map(p => p.spotId));
    return [...photoSpotIds]
      .map(id => ({ spotId: id, ...coordMap.get(id)! }))
      .filter(loc => loc.latitude != null);
  }, [footprints, myPhotos]);

  // 地図リージョン（ワンショットポイントベース）
  const mapRegion = useMemo<Region>(() => {
    if (oneshotLocations.length === 0) return TOKYO_REGION;
    if (oneshotLocations.length === 1) {
      return {
        latitude: oneshotLocations[0].latitude,
        longitude: oneshotLocations[0].longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    const lats = oneshotLocations.map(l => l.latitude);
    const lngs = oneshotLocations.map(l => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.02),
    };
  }, [oneshotLocations]);

  // TOP3のワンショット画像マッチ（spotIdごとの最新写真）
  const topSpotPhotos = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of topSpots) {
      const photo = myPhotos.find(p => p.spotId === ts.spotId && p.photoUri);
      if (photo?.photoUri) map.set(ts.spotId, photo.photoUri);
    }
    return map;
  }, [topSpots, myPhotos]);

  const visiblePhotos = myPhotos.slice(0, photoPage * PHOTOS_PER_PAGE);
  const hasMorePhotos = myPhotos.length > visiblePhotos.length;

  return (
    <View style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200 && hasMorePhotos) {
            setPhotoPage((p) => p + 1);
          }
        }}
        scrollEventThrottle={400}
      >

        {/* ── ① バイク写真カード ──────────────────────── */}
        <Text style={s.sectionTitle}>マイバイク</Text>
        <TouchableOpacity
          style={s.photoCard}
          onPress={handleChangePhoto}
          activeOpacity={0.85}
        >
          {bike?.photoUrl ? (
            <Image source={{ uri: bike.photoUrl }} style={s.photoImage} />
          ) : (
            <View style={s.photoPlaceholder}>
              <MaterialCommunityIcons name="motorbike" size={40} color={C.accent} />
              <Text style={s.photoPlaceholderText}>タップして写真を設定</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── ② 排気量選択 ────────────────────────────── */}
        <Text style={s.sectionTitle}>排気量選択</Text>
        <View style={s.ccRow}>
          {CC_OPTIONS.map((opt) => {
            const active = userCC === opt.value || (userCC === undefined && opt.value === null);
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={[s.ccBtn, active && s.ccBtnActive]}
                onPress={() => { handleChangeCC(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.7}
              >
                <Text style={[s.ccText, active && s.ccTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── ③ お気に入りTOP3 ───────────────────────── */}
        {topSpots.length > 0 && (
          <>
            <Text style={s.sectionTitle}>お気に入り</Text>
            <View style={s.topGrid}>
              {topSpots.map((ts) => {
                const photoUri = topSpotPhotos.get(ts.spotId);
                return (
                  <TouchableOpacity
                    key={ts.spotId}
                    style={s.topCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      onGoToSpot?.({
                        id: ts.spotId,
                        name: ts.spotName,
                        latitude: ts.latitude,
                        longitude: ts.longitude,
                        source: 'seed',
                      } as ParkingPin);
                    }}
                  >
                    {photoUri ? (
                      <Image source={{ uri: photoUri }} style={s.topPhoto} />
                    ) : (
                      <View style={s.topPhotoPlaceholder}>
                        <MaterialCommunityIcons name="motorbike" size={24} color={C.sub} />
                      </View>
                    )}
                    <View style={s.topInfo}>
                      <Text style={s.topName} numberOfLines={2}>{ts.spotName}</Text>
                      <View style={s.topMeta}>
                        <Ionicons name="camera" size={11} color={C.accent} />
                        <Text style={s.topCount}>{ts.count}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── ④ ワンショットマップ ───────────────────── */}
        <Text style={s.sectionTitle}>ワンショットマップ</Text>
        <View style={s.mapCard}>
          <MapView
            style={s.map}
            initialRegion={mapRegion}
            region={mapRegion}
            customMapStyle={DARK_MAP_STYLE}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            {oneshotLocations.map((loc) => (
              <Marker
                key={loc.spotId}
                coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                pinColor="#FF453A"
              />
            ))}
          </MapView>

          {oneshotLocations.length === 0 && (
            <View style={s.mapEmptyOverlay}>
              <Ionicons name="map-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={s.mapEmptyText}>ワンショットで地図に刻もう</Text>
            </View>
          )}

          {oneshotLocations.length > 0 && (
            <View style={s.mapBadge}>
              <Text style={s.mapBadgeText}>{oneshotLocations.length}か所</Text>
            </View>
          )}
        </View>

        {/* ── ⑤ ワンショット履歴 ─────────────────────── */}
        <Text style={s.sectionTitle}>ワンショット</Text>
        {myPhotos.length === 0 ? (
          <View style={s.emptyActivity}>
            <Ionicons name="camera" size={24} color={C.accent} />
            <Text style={s.emptyText}>ワンショットで最初の1枚を撮ろう</Text>
          </View>
        ) : (
          <>
            <View style={s.oneshotGrid}>
              {visiblePhotos.map((item) => (
                <TouchableOpacity
                  key={`os_${item.firestoreId ?? item.id}`}
                  style={s.oneshotCell}
                  activeOpacity={0.85}
                  onPress={() => {
                    onGoToSpot?.({
                      id: item.spotId,
                      name: spotNameMap.get(item.spotId) ?? '',
                      latitude: 0,
                      longitude: 0,
                      source: 'seed',
                    } as ParkingPin, item.firestoreId);
                  }}
                >
                  <Image source={{ uri: item.photoUri! }} style={s.oneshotThumb} />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                    style={s.oneshotOverlay}
                  >
                    <Text style={s.oneshotCellName} numberOfLines={1}>
                      {spotNameMap.get(item.spotId) ?? item.spotId}
                    </Text>
                    <Text style={s.oneshotCellTime}>{formatOneshotTime(item.createdAt)}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
            {hasMorePhotos && (
              <View style={s.loadingMore}>
                <Text style={s.loadingMoreText}>スクロールでさらに表示</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
      <PickerSheet />
    </View>
  );
}

const TOP_CARD_W = Math.floor((SCREEN_W - 16 * 2 - 8 * 2) / 3);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Constants.statusBarHeight },
  content: { paddingBottom: 20 },

  // ── ① バイク写真カード ──
  photoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  photoImage: {
    width: '100%',
    height: 180,
  },
  photoPlaceholder: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoPlaceholderText: {
    color: C.sub,
    fontSize: 13,
  },

  // ── ② 排気量選択 ──
  ccRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  ccBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  ccBtnActive: {
    backgroundColor: 'rgba(10,132,255,0.18)',
    borderColor: 'rgba(10,132,255,0.5)',
  },
  ccText: {
    color: C.sub,
    fontSize: 13,
    fontWeight: '600',
  },
  ccTextActive: {
    color: C.blue,
  },

  // ── Section ──
  sectionTitle: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 18,
    marginTop: 24,
  },

  // ── ③ お気に入りTOP3 ──
  topGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  topCard: {
    width: TOP_CARD_W,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  topPhoto: {
    width: '100%',
    height: TOP_CARD_W,
  },
  topPhotoPlaceholder: {
    width: '100%',
    height: TOP_CARD_W,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  topInfo: {
    padding: 8,
    gap: 4,
  },
  topName: {
    color: C.text,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  topCount: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── ④ ワンショット履歴 ──
  emptyActivity: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: C.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  oneshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
  },
  oneshotCell: {
    width: Math.floor((SCREEN_W - 2) / 3),
    aspectRatio: 1,
    overflow: 'hidden',
  },
  oneshotThumb: { width: '100%', height: '100%' },
  oneshotOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingBottom: 5,
    paddingTop: 16,
  },
  oneshotCellName: { color: '#fff', fontSize: 10, fontWeight: '600' },
  oneshotCellTime: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },
  loadingMore: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  loadingMoreText: { color: C.sub, fontSize: 12 },

  // ── ⑤ ワンショットマップ ──
  mapCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    height: 280,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  map: { flex: 1 },
  mapEmptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  mapEmptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 8 },
  mapBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  mapBadgeText: { color: C.text, fontSize: 12, fontWeight: '700' },
  markerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF453A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});
