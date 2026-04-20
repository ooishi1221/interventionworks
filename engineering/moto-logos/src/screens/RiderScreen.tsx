/**
 * RiderScreen v7 — ライダーノート
 *
 * ① バイク写真カード（タップで変更）
 * ② 排気量選択（4択）
 * ③ よく撮ってるスポットTOP3（ワンショット数順）
 * ④ ワンショット履歴（3列グリッド）← ファーストビュー化
 * ⑤ ワンショットマップ（180pt、最下部）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getFirstVehicle,
  getFootprints,
  getTopSpots,
  updateVehicle,
  insertVehicle,
  type Footprint,
  type TopSpot,
} from '../db/database';
import { fetchUserPhotos, syncBikeToFirestore } from '../firebase/firestoreService';
import { useUser } from '../contexts/UserContext';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import { ParkingPin, Vehicle, Review, UserCC } from '../types';
import { DARK_MAP_STYLE, STAR_MAP_STYLE } from '../constants/mapStyle';
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

// ── 星図マーカー（3段階グロー） ──
// ── 星図マーカー（3層同心円グロー、shadow不使用で安定描画） ──
const StarMarker = React.memo(function StarMarker({ visitCount }: { visitCount: number }) {
  const tier = visitCount >= 3 ? 3 : visitCount >= 2 ? 2 : 1;
  const styles = STAR_TIERS[tier];
  return (
    <View style={styles.outer}>
      <View style={styles.mid}>
        <View style={styles.core} />
      </View>
    </View>
  );
});

// 3段階 × 3層（outer: ぼんやり広がり / mid: 中間グロー / core: 明るい中心）
const STAR_TIERS: Record<number, { outer: object; mid: object; core: object }> = {
  1: {
    outer: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: 'rgba(255,240,220,0.08)',
      alignItems: 'center', justifyContent: 'center',
    },
    mid: {
      width: 12, height: 12, borderRadius: 6,
      backgroundColor: 'rgba(255,240,220,0.18)',
      alignItems: 'center', justifyContent: 'center',
    },
    core: {
      width: 5, height: 5, borderRadius: 2.5,
      backgroundColor: 'rgba(255,252,245,0.9)',
    },
  },
  2: {
    outer: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: 'rgba(255,240,220,0.10)',
      alignItems: 'center', justifyContent: 'center',
    },
    mid: {
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: 'rgba(255,235,210,0.22)',
      alignItems: 'center', justifyContent: 'center',
    },
    core: {
      width: 7, height: 7, borderRadius: 3.5,
      backgroundColor: 'rgba(255,250,240,0.95)',
    },
  },
  3: {
    outer: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(255,230,200,0.12)',
      alignItems: 'center', justifyContent: 'center',
    },
    mid: {
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: 'rgba(255,225,190,0.28)',
      alignItems: 'center', justifyContent: 'center',
    },
    core: {
      width: 9, height: 9, borderRadius: 4.5,
      backgroundColor: '#FFFAF0',
    },
  },
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
  const [nicknameModal, setNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [bikeNameModal, setBikeNameModal] = useState(false);
  const [bikeNameInput, setBikeNameInput] = useState('');
  const [starMapModal, setStarMapModal] = useState(false);
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

  // bike が未作成なら自動で作る。以降の UPDATE を必ず成功させるため。
  const ensureBike = useCallback(async (): Promise<Vehicle> => {
    if (bike) return bike;
    await insertVehicle({
      name: '',
      type: 'motorcycle',
      cc: userCC,
    });
    const created = await getFirstVehicle();
    if (!created) throw new Error('insertVehicle failed');
    setBike(created);
    return created;
  }, [bike, userCC]);

  // バイク写真変更
  const handleChangePhoto = useCallback(async () => {
    const uri = await showPicker();
    if (!uri) return;
    try {
      const current = await ensureBike();
      await updateVehicle(current.id, { ...current, photoUrl: uri });
      setBike({ ...current, photoUrl: uri });
      const uid = user?.userId;
      if (uid) syncBikeToFirestore(uid, { ...current, photoUrl: uri }).catch((e) => captureError(e, { context: 'sync_bike_photo' }));
      onDataChanged?.();
    } catch (e) {
      captureError(e, { context: 'change_bike_photo' });
    }
  }, [ensureBike, showPicker, user?.userId, onDataChanged]);

  // バイク名変更
  const handleChangeBikeName = useCallback(async (name: string) => {
    try {
      const current = await ensureBike();
      await updateVehicle(current.id, { ...current, name });
      setBike({ ...current, name });
      const uid = user?.userId;
      if (uid) syncBikeToFirestore(uid, { ...current, name }).catch((e) => captureError(e, { context: 'sync_bike_name' }));
    } catch (e) {
      captureError(e, { context: 'change_bike_name' });
    }
  }, [ensureBike, user?.userId]);

  // CC変更
  const handleChangeCC = useCallback(async (cc: UserCC) => {
    onChangeCC?.(cc);
    try {
      const current = await ensureBike();
      await updateVehicle(current.id, { ...current, cc });
      setBike({ ...current, cc });
      const uid = user?.userId;
      if (uid) syncBikeToFirestore(uid, { ...current, cc }).catch(() => {});
    } catch (e) {
      captureError(e, { context: 'change_cc' });
    }
  }, [ensureBike, onChangeCC, user?.userId]);

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

  // スポットごとの訪問回数（星の光強度に使用）
  const visitCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of myPhotos) {
      if (p.photoUri) map.set(p.spotId, (map.get(p.spotId) ?? 0) + 1);
    }
    return map;
  }, [myPhotos]);

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

  // フルスクリーン星図の初期表示（最初の足跡を中心に近所エリア全体が見える広さ）
  const fullStarRegion = useMemo<Region>(() => {
    if (oneshotLocations.length === 0) return mapRegion;
    // 初訪問順で最初のスポット
    const sorted = [...myPhotos].filter(p => p.photoUri).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const firstSpotId = sorted[0]?.spotId;
    const loc = oneshotLocations.find(l => l.spotId === firstSpotId) ?? oneshotLocations[0];
    return {
      latitude: loc.latitude,
      longitude: loc.longitude,
      latitudeDelta: 0.03, // 0.004 は building レベルで近すぎ。駅1-2駅ぶんの広さに
      longitudeDelta: 0.03,
    };
  }, [oneshotLocations, myPhotos, mapRegion]);

  // TOP3のワンショット画像マッチ（spotIdごとの最新写真）
  const topSpotPhotos = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of topSpots) {
      const photo = myPhotos.find(p => p.spotId === ts.spotId && p.photoUri);
      if (photo?.photoUri) map.set(ts.spotId, photo.photoUri);
    }
    return map;
  }, [topSpots, myPhotos]);

  const CELL_SIZE = Math.floor((SCREEN_W - 2) / 3);

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: CELL_SIZE + 1,
    offset: (CELL_SIZE + 1) * Math.floor(index / 3),
    index,
  }), [CELL_SIZE]);

  const renderOneshotItem = useCallback(({ item }: { item: Review }) => (
    <TouchableOpacity
      style={s.oneshotCell}
      activeOpacity={0.85}
      onPress={() => {
        const loc = oneshotLocations.find(l => l.spotId === item.spotId);
        if (!loc) return;
        onGoToSpot?.({
          id: item.spotId,
          name: loc.spotName ?? spotNameMap.get(item.spotId) ?? '',
          latitude: loc.latitude,
          longitude: loc.longitude,
          source: 'seed',
        } as ParkingPin, item.firestoreId);
      }}
    >
      <Image source={item.photoUri!} style={s.oneshotThumb} transition={200} cachePolicy="disk" />
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
  ), [spotNameMap, onGoToSpot, oneshotLocations]);

  const oneshotKeyExtractor = useCallback((item: Review) => `os_${item.firestoreId ?? item.id}`, []);

  // 初訪問順の軌跡パス（同一スポット再訪はスキップ）
  const firstVisitPath = useMemo(() => {
    const seen = new Set<string>();
    const path: { latitude: number; longitude: number }[] = [];
    // myPhotos を createdAt 昇順にソートし、各スポットの初訪問だけ拾う
    const sorted = [...myPhotos].filter(p => p.photoUri).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const coordMap = new Map<string, { latitude: number; longitude: number }>();
    for (const loc of oneshotLocations) {
      coordMap.set(loc.spotId, { latitude: loc.latitude, longitude: loc.longitude });
    }
    for (const p of sorted) {
      if (seen.has(p.spotId)) continue;
      seen.add(p.spotId);
      const coord = coordMap.get(p.spotId);
      if (coord) path.push(coord);
    }
    return path;
  }, [myPhotos, oneshotLocations]);

  // 軌跡ライン（古い→新しいでフェードイン）
  const trailSegments = useMemo(() => {
    if (firstVisitPath.length < 2) return null;
    const total = firstVisitPath.length - 1;
    return firstVisitPath.slice(0, -1).map((_, i) => {
      const opacity = 0.15 + (i / total) * 0.45; // 0.15 → 0.60
      return (
        <Polyline
          key={`trail_${i}`}
          coordinates={[firstVisitPath[i], firstVisitPath[i + 1]]}
          strokeColor={`rgba(255,240,220,${opacity})`}
          strokeWidth={3}
          geodesic
        />
      );
    });
  }, [firstVisitPath]);

  // ── フルスクリーン軌跡アニメーション ──
  const [trailProgress, setTrailProgress] = useState(-1);
  const trailRafRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullMapRef = useRef<MapView | null>(null);
  const lastCameraSpotRef = useRef(0); // カメラ追従済みのスポット数
  const SEGMENT_DURATION = 600;
  const TICK_INTERVAL = 33;

  useEffect(() => {
    if (starMapModal && firstVisitPath.length >= 2) {
      setTrailProgress(0);
      lastCameraSpotRef.current = 0;
      const total = firstVisitPath.length - 1;
      const step = TICK_INTERVAL / SEGMENT_DURATION;
      let progress = 0;
      let lastCameraSeg = -1; // セグメント開始時カメラパン追跡

      const tick = () => {
        progress = Math.min(progress + step, total);
        setTrailProgress(progress);

        const seg = Math.floor(progress);
        const map = fullMapRef.current;
        if (!map) { /* noop */ }
        // ── セグメント開始: 次のスポットへ向かってカメラがパン ──
        else if (seg > lastCameraSeg && seg < total) {
          lastCameraSeg = seg;
          const from = firstVisitPath[seg];
          const to = firstVisitPath[seg + 1];
          // from → to の中点よりやや to 寄り（先読み感）
          const lat = from.latitude * 0.3 + to.latitude * 0.7;
          const lng = from.longitude * 0.3 + to.longitude * 0.7;
          const dLat = Math.abs(to.latitude - from.latitude);
          const dLng = Math.abs(to.longitude - from.longitude);
          // 弧を描いて飛んでいく演出: animateCamera で pitch を傾け、
          // 地図を斜め視点にして弾道のような見た目に。距離が長いほど高く。
          // 近寄りすぎ/傾きすぎると画面が訳わからなくなるため抑えめ。
          const distance = Math.sqrt(dLat * dLat + dLng * dLng);
          const pitch = Math.min(25, 5 + distance * 300); // 最大25度 (以前45)
          const heading =
            (Math.atan2(to.longitude - from.longitude, to.latitude - from.latitude) * 180) / Math.PI;
          map.animateCamera(
            {
              center: { latitude: lat, longitude: lng },
              pitch,
              heading,
              zoom: Math.max(12, 14 - distance * 25), // ベース14, 最低12 (以前は16/13)
            },
            { duration: SEGMENT_DURATION },
          );
        }
        // ── 全セグメント完了: 全体が収まるように引く ──
        else if (progress >= total && lastCameraSeg < total) {
          lastCameraSeg = total;
          const lats = firstVisitPath.map(p => p.latitude);
          const lngs = firstVisitPath.map(p => p.longitude);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          map.animateToRegion({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.008),
            longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.008),
          }, 800);
        }

        if (progress < total) {
          trailRafRef.current = setTimeout(tick, TICK_INTERVAL);
        }
      };
      trailRafRef.current = setTimeout(tick, 500);
    } else {
      setTrailProgress(-1);
    }
    return () => {
      if (trailRafRef.current) clearTimeout(trailRafRef.current);
    };
  }, [starMapModal, firstVisitPath]);

  // firstVisitPath の spotId 順マップ（星の点灯判定に使用）
  const firstVisitSpotOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    const sorted = [...myPhotos].filter(p => p.photoUri).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (const p of sorted) {
      if (seen.has(p.spotId)) continue;
      seen.add(p.spotId);
      order.push(p.spotId);
    }
    return order;
  }, [myPhotos]);

  // アニメーション中の軌跡セグメント（フルスクリーン用）
  const animatedTrailSegments = useMemo(() => {
    if (firstVisitPath.length < 2 || trailProgress <= 0) return null;
    const total = firstVisitPath.length - 1;
    const completedCount = Math.floor(trailProgress);
    const partialFrac = trailProgress - completedCount;

    const segments: React.ReactElement[] = [];
    for (let i = 0; i < completedCount && i < total; i++) {
      const opacity = 0.15 + (i / Math.max(total - 1, 1)) * 0.45;
      segments.push(
        <Polyline
          key={`atrail_${i}`}
          coordinates={[firstVisitPath[i], firstVisitPath[i + 1]]}
          strokeColor={`rgba(255,240,220,${opacity})`}
          strokeWidth={3}
          geodesic
        />,
      );
    }
    // 描画中セグメント（座標を補間）
    if (completedCount < total && partialFrac > 0) {
      const from = firstVisitPath[completedCount];
      const to = firstVisitPath[completedCount + 1];
      const mid = {
        latitude: from.latitude + (to.latitude - from.latitude) * partialFrac,
        longitude: from.longitude + (to.longitude - from.longitude) * partialFrac,
      };
      const opacity = 0.15 + (completedCount / Math.max(total - 1, 1)) * 0.45;
      segments.push(
        <Polyline
          key={`atrail_${completedCount}`}
          coordinates={[from, mid]}
          strokeColor={`rgba(255,240,220,${opacity})`}
          strokeWidth={3}
          geodesic
        />,
      );
    }
    return segments;
  }, [firstVisitPath, trailProgress]);

  // ミニカード用マーカー（常時全表示）
  const starMapMarkers = useMemo(() => oneshotLocations.map((loc) => (
    <Marker
      key={`star_${loc.spotId}`}
      coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges
    >
      <StarMarker visitCount={visitCountMap.get(loc.spotId) ?? 1} />
    </Marker>
  )), [oneshotLocations, visitCountMap]);

  // フルスクリーン用マーカー（到達した星だけ点灯）
  const animatedStarMarkers = useMemo(() => {
    if (trailProgress < 0) return starMapMarkers; // Modal外では全表示
    const reachedCount = Math.floor(trailProgress) + 1; // 最初の星は即表示
    return oneshotLocations.map((loc) => {
      const orderIndex = firstVisitSpotOrder.indexOf(loc.spotId);
      const reached = orderIndex < 0 || orderIndex < reachedCount;
      return (
        <Marker
          key={`star_${loc.spotId}`}
          coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges
          opacity={reached ? 1 : 0}
        >
          <StarMarker visitCount={reached ? (visitCountMap.get(loc.spotId) ?? 1) : 1} />
        </Marker>
      );
    });
  }, [oneshotLocations, visitCountMap, trailProgress, firstVisitSpotOrder, starMapMarkers]);

  const listHeader = useMemo(() => (
    <>
      {/* ── ライダー名 ── */}
      <TouchableOpacity
        style={s.nicknameRow}
        onPress={() => { setNicknameInput(nickname || ''); setNicknameModal(true); }}
        activeOpacity={0.7}
      >
        <Text style={s.nicknameName}>{nickname || 'ライダー名を設定'}</Text>
        <Ionicons name="pencil" size={12} color={C.sub} />
      </TouchableOpacity>

      {/* ── プロフィールヘッダー（丸写真 + カウンター + ミニ星図） ── */}
      <View style={s.profileHeader}>
        <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.85}>
          <View style={s.profileAvatar}>
            {bike?.photoUrl ? (
              <Image source={bike.photoUrl} style={s.profileAvatarImg} transition={200} cachePolicy="disk" />
            ) : (
              <View style={s.profileAvatarEmpty}>
                <MaterialCommunityIcons name="motorbike" size={32} color={C.accent} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={s.profileRight}>
          <View style={s.counterRow}>
            <View style={s.counterItem}>
              <Text style={s.counterNum}>{myPhotos.length}</Text>
              <Text style={s.counterLabel}>ワンショット</Text>
            </View>
            <View style={s.counterItem}>
              <Text style={s.counterNum}>{oneshotLocations.length}</Text>
              <Text style={s.counterLabel}>スポット</Text>
            </View>
            <TouchableOpacity
              style={s.counterItem}
              activeOpacity={0.85}
              onPress={() => oneshotLocations.length > 0 && setStarMapModal(true)}
            >
              <View style={s.miniStarMap}>
                <MapView
                  style={s.miniStarMapInner}
                  initialRegion={mapRegion}
                  region={mapRegion}
                  customMapStyle={STAR_MAP_STYLE}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  pointerEvents="none"
                >
                  {trailSegments}
                  {starMapMarkers}
                </MapView>
                {oneshotLocations.length === 0 && (
                  <View style={s.miniStarMapEmpty}>
                    <Ionicons name="navigate" size={16} color="rgba(255,255,255,0.15)" />
                  </View>
                )}
              </View>
              <Text style={s.counterLabel}>星図</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── 車種名 ── */}
      <TouchableOpacity
        style={s.bioRow}
        onPress={() => { setBikeNameInput(bike?.name || ''); setBikeNameModal(true); }}
        activeOpacity={0.7}
      >
        <Text style={s.bioText}>{bike?.name || '車種名を入力'}</Text>
        <Ionicons name="pencil" size={10} color={C.sub} style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      {/* ── 排気量ピル ── */}
      <View style={s.ccPillRow}>
        {CC_OPTIONS.map((opt) => {
          const active = userCC === opt.value || (userCC === undefined && opt.value === null);
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[s.ccPill, active && s.ccPillActive]}
              onPress={() => { handleChangeCC(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.7}
            >
              <Text style={[s.ccPillText, active && s.ccPillTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── TOP3 ストーリーズ風 ── */}
      {topSpots.length > 0 && (
        <View style={s.storyRow}>
          {topSpots.map((ts) => {
            const photoUri = topSpotPhotos.get(ts.spotId);
            return (
              <TouchableOpacity
                key={ts.spotId}
                style={s.storyItem}
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
                <View style={s.storyRing}>
                  {photoUri ? (
                    <Image source={photoUri} style={s.storyPhoto} transition={200} cachePolicy="disk" />
                  ) : (
                    <View style={s.storyPhotoEmpty}>
                      <MaterialCommunityIcons name="motorbike" size={18} color={C.sub} />
                    </View>
                  )}
                </View>
                <Text style={s.storyName} numberOfLines={1}>{ts.spotName}</Text>
                <View style={s.storyMeta}>
                  <Ionicons name="camera" size={9} color={C.accent} />
                  <Text style={s.storyCount}>{ts.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── グリッド区切り ── */}
      <View style={s.gridDivider} />
      {myPhotos.length === 0 && (
        <View style={s.emptyActivity}>
          <Ionicons name="camera" size={24} color={C.accent} />
          <Text style={s.emptyText}>ワンショットで最初の1枚を撮ろう</Text>
        </View>
      )}
    </>
  ), [nickname, bike, userCC, topSpots, topSpotPhotos, myPhotos.length, oneshotLocations, mapRegion, trailSegments, starMapMarkers, handleChangePhoto, handleChangeCC, onGoToSpot]);

  const listFooter = useMemo(() => (
    <View style={{ height: 60 }} />
  ), []);

  return (
    <View style={s.safe}>
      <FlatList
        data={myPhotos}
        keyExtractor={oneshotKeyExtractor}
        renderItem={renderOneshotItem}
        numColumns={3}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
        getItemLayout={getItemLayout}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews
        columnWrapperStyle={s.oneshotRow}
      />
      <PickerSheet />

      {/* ── ニックネーム編集モーダル ── */}
      <Modal visible={nicknameModal} transparent animationType="fade" onRequestClose={() => setNicknameModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setNicknameModal(false)}>
            <TouchableOpacity activeOpacity={1} style={s.modalCard} onPress={() => {}}>
              <Text style={s.modalTitle}>ライダー名</Text>
              <TextInput
                style={s.modalInput}
                value={nicknameInput}
                onChangeText={setNicknameInput}
                placeholder="名前を入力"
                placeholderTextColor={C.sub}
                autoFocus
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (nicknameInput.trim()) {
                    onChangeNickname?.(nicknameInput.trim());
                    setNicknameModal(false);
                  }
                }}
              />
              <View style={s.modalBtnRow}>
                <TouchableOpacity style={s.modalBtnCancel} onPress={() => setNicknameModal(false)}>
                  <Text style={s.modalBtnCancelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalBtnSave, !nicknameInput.trim() && { opacity: 0.4 }]}
                  disabled={!nicknameInput.trim()}
                  onPress={() => {
                    onChangeNickname?.(nicknameInput.trim());
                    setNicknameModal(false);
                  }}
                >
                  <Text style={s.modalBtnSaveText}>保存</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── 車種名編集モーダル ── */}
      <Modal visible={bikeNameModal} transparent animationType="fade" onRequestClose={() => setBikeNameModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setBikeNameModal(false)}>
            <TouchableOpacity activeOpacity={1} style={s.modalCard} onPress={() => {}}>
              <Text style={s.modalTitle}>車種名</Text>
              <TextInput
                style={s.modalInput}
                value={bikeNameInput}
                onChangeText={setBikeNameInput}
                placeholder="例: CBR650R"
                placeholderTextColor={C.sub}
                autoFocus
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={async () => {
                  if (bikeNameInput.trim()) {
                    await handleChangeBikeName(bikeNameInput.trim());
                    setBikeNameModal(false);
                  }
                }}
              />
              <View style={s.modalBtnRow}>
                <TouchableOpacity style={s.modalBtnCancel} onPress={() => setBikeNameModal(false)}>
                  <Text style={s.modalBtnCancelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalBtnSave, !bikeNameInput.trim() && { opacity: 0.4 }]}
                  disabled={!bikeNameInput.trim()}
                  onPress={async () => {
                    await handleChangeBikeName(bikeNameInput.trim());
                    setBikeNameModal(false);
                  }}
                >
                  <Text style={s.modalBtnSaveText}>保存</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 星図フルスクリーン ── */}
      <Modal visible={starMapModal} animationType="slide" onRequestClose={() => setStarMapModal(false)}>
        <View style={s.starMapFull}>
          <MapView
            ref={fullMapRef}
            style={{ flex: 1 }}
            initialRegion={fullStarRegion}
            customMapStyle={STAR_MAP_STYLE}
            scrollEnabled
            zoomEnabled
            rotateEnabled={false}
            pitchEnabled={false}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
          >
            {animatedTrailSegments}
            {animatedStarMarkers}
          </MapView>

          <View style={s.starMapHeader}>
            <Text style={s.starMapCountText}>{oneshotLocations.length}か所の足跡</Text>
          </View>

          <TouchableOpacity
            style={s.starMapCloseBtn}
            onPress={() => setStarMapModal(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Constants.statusBarHeight },
  content: { paddingBottom: 20 },

  // ── ライダー名 ──
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  nicknameName: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },

  // ── プロフィールヘッダー ──
  profileHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 20,
    alignItems: 'flex-start',
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  profileAvatarImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  profileAvatarEmpty: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  profileRight: {
    flex: 1,
    justifyContent: 'center',
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  counterItem: {
    alignItems: 'center',
  },
  counterNum: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  counterLabel: {
    color: C.sub,
    fontSize: 11,
    marginTop: 2,
  },
  miniStarMap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  miniStarMapInner: {
    width: 48,
    height: 48,
  },
  miniStarMapEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // ── 車種名 ──
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
  },
  bioText: {
    color: C.sub,
    fontSize: 14,
  },

  // ── 排気量ピル ──
  ccPillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  ccPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  ccPillActive: {
    backgroundColor: 'rgba(10,132,255,0.15)',
    borderColor: 'rgba(10,132,255,0.4)',
  },
  ccPillText: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
  },
  ccPillTextActive: {
    color: C.blue,
  },

  // ── TOP3 ストーリーズ ──
  storyRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    justifyContent: 'space-around',
  },
  storyItem: {
    alignItems: 'center',
    flex: 1,
  },
  storyRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  storyPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  storyPhotoEmpty: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  storyName: {
    color: C.sub,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  storyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  storyCount: {
    color: C.accent,
    fontSize: 9,
    fontWeight: '700',
  },

  // ── グリッド区切り ──
  gridDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginTop: 16,
    marginBottom: 2,
  },

  // ── ワンショットグリッド ──
  emptyActivity: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: C.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  oneshotRow: {
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
  // ── 星図フルスクリーン ──
  starMapFull: {
    flex: 1,
    backgroundColor: '#000000',
  },
  starMapHeader: {
    position: 'absolute',
    top: (Constants.statusBarHeight ?? 44) + 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  starMapCountText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  starMapCloseBtn: {
    position: 'absolute',
    top: (Constants.statusBarHeight ?? 44) + 8,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── ニックネームモーダル ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: SCREEN_W - 64,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingHorizontal: 16,
    color: C.text,
    fontSize: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtnCancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  modalBtnCancelText: {
    color: C.sub,
    fontSize: 15,
    fontWeight: '600',
  },
  modalBtnSave: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  modalBtnSaveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
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
