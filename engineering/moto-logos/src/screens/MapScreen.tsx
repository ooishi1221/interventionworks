import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  Keyboard,
  Animated as RNAnimated,
  Dimensions,
  Linking,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, UserCC, MaxCC } from '../types';
import { filterByCC } from '../data/adachi-parking';
import { Spacing } from '../constants/theme';
import { fetchSpotsInRegion, addUserSpotToFirestore, addReview, logActivity, reportParked } from '../firebase/firestoreService';
import { insertUserSpot, getFirstVehicle } from '../db/database';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { SpotDetailSheet } from '../components/SpotDetailSheet';
import { captureError } from '../utils/sentry';
import { pickPhotoFromCamera } from '../utils/photoPicker';
import { haversineMeters } from '../utils/distance';
import { useUser } from '../contexts/UserContext';
import { LiveFeed } from '../components/LiveFeed';
import { useProximityState } from '../hooks/useProximityState';
import { useArrivalDetection } from '../hooks/useArrivalDetection';
import { ProximityContextCard } from '../components/ProximityContextCard';
import { NearbySpotsList, AreaSummary } from '../components/NearbySpotsList';
import { SearchOverlay, SearchResult } from '../components/SearchOverlay';
import { useTutorial } from '../contexts/TutorialContext';

// GPS取得前の初期表示: 日本全体（東京偏りを感じさせない）
const JAPAN_CENTER: Region = {
  latitude: 36.0,
  longitude: 138.0,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

const SYS_BLUE = '#0A84FF';
const SYS_GRAY = '#636366';

import { SpotTemperature, TEMP_STYLE, spotTemperature } from '../utils/temperature';

function markerColor(spot: ParkingPin): string {
  const temp = spotTemperature(spot);
  if (temp !== 'cold') return TEMP_STYLE[temp].color;
  if (spot.source === 'user') return '#BF5AF2';
  return SYS_GRAY;
}

// ─── 温度ピン ─────────────────────────────────────────
const SpotPin = React.memo(function SpotPin({ spot }: { spot: ParkingPin }) {
  const temp = spotTemperature(spot);
  const style = TEMP_STYLE[temp];
  const hasPulse = style.auraDuration > 0;
  const pulse = useRef(new RNAnimated.Value(1)).current;
  const entrance = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.spring(entrance, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }).start();
  }, []);

  // 温度に応じた脈動（blazing=激しく、hot=中、warm=穏やか、cool/cold=なし）
  useEffect(() => {
    if (!hasPulse) { pulse.setValue(1); return; }
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: style.pulseScale, duration: style.auraDuration, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 1, duration: style.auraDuration, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [hasPulse, style.pulseScale, style.auraDuration]);

  const color = markerColor(spot);
  const auraSize = temp === 'blazing' ? 44 : 36;

  return (
    <RNAnimated.View style={{ alignItems: 'center', justifyContent: 'center', width: 48, height: 48, overflow: 'hidden', transform: [{ scale: entrance }], opacity: entrance }}>
      {/* 温度オーラ（cold以外） */}
      {temp !== 'cold' && (
        <RNAnimated.View
          style={{
            position: 'absolute',
            width: auraSize, height: auraSize, borderRadius: auraSize / 2,
            backgroundColor: color,
            opacity: temp === 'blazing' ? 0.45 : temp === 'hot' ? 0.3 : 0.15,
            transform: [{ scale: hasPulse ? pulse : entrance }],
          }}
        />
      )}
      <RNAnimated.View style={[
        styles.pin,
        { backgroundColor: color, transform: [{ scale: hasPulse ? pulse : entrance }] },
      ]}>
        <Text style={styles.pinText}>
          {(spot.currentParked ?? 0) > 0 ? `${spot.currentParked}` : spot.source === 'user' ? '★' : 'P'}
        </Text>
      </RNAnimated.View>
    </RNAnimated.View>
  );
});

/** App.tsx から ref 経由で呼び出せるメソッド */
export interface MapScreenHandle {
  resetView: () => void;
}

interface Props {
  userCC: UserCC;
  onChangeCC?: (cc: UserCC) => void;
  ccFilterEnabled?: boolean;
  onToggleCcFilter?: (enabled: boolean) => void;
  focusSpot?: ParkingPin | null;
  onFocusConsumed?: () => void;
  refreshTrigger?: number;
}

export const MapScreen = forwardRef<MapScreenHandle, Props>(function MapScreen(
  { userCC, onChangeCC, ccFilterEnabled = true, onToggleCcFilter, focusSpot, onFocusConsumed, refreshTrigger },
  ref
) {
  const user = useUser();
  const tutorial = useTutorial();
  const mapRef = useRef<MapView>(null);
  const [allSpotsRaw, setAllSpotsRaw]     = useState<ParkingPin[]>([]);
  const [loading, setLoading]             = useState(true);
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const [selected, setSelected]           = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locationDenied, setLocationDenied]   = useState(false);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // ── 近接コンテキストカード (#90) ────────────────────
  const proximityEnabled = !selected && locationGranted;
  const { state: proximityState, getNearbyAlternatives } = useProximityState({
    spots: allSpotsRaw,
    enabled: proximityEnabled,
  });

  // ── 到着検知 ────────────────────────────────────────────
  const { setDestination } = useArrivalDetection();

  // ── 検索 ──────────────────────────────────────────────
  const [searchVisible, setSearchVisible]     = useState(false);
  const [searchText, setSearchText]           = useState('');
  const [searching, setSearching]             = useState(false);
  const [searchResultMsg, setSearchResultMsg] = useState<string | null>(null);

  // setTimeout リーク防止用 ref
  const miscTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (miscTimerRef.current) clearTimeout(miscTimerRef.current); }, []);
  const [areaSummary, setAreaSummary]         = useState<AreaSummary | null>(null);

  // ── ライブフィード設定 ──────────────────────────────
  const [liveFeedEnabled, setLiveFeedEnabled] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem('moto_logos_live_feed').then((v) => setLiveFeedEnabled(v !== 'false'));
  }, []);


  const lastFetchRegionRef = useRef<Region | null>(null);

  /**
   * 指定リージョンの geohash 範囲で Firestore からスポットを取得。
   * 既存スポットにマージ（同一ID上書き）して重複なくピンを蓄積する。
   */
  const fetchSpotsForRegion = useCallback(async (region: Region): Promise<ParkingPin[]> => {
    setLoading(true);
    let fetched: ParkingPin[] = [];
    try {
      fetched = await fetchSpotsInRegion(region);
      // 既存データとマージ（新エリア分を追加、同一IDは上書き、遠方を除外）
      setAllSpotsRaw((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        for (const s of fetched) map.set(s.id, s);
        const all = Array.from(map.values());
        if (all.length <= 500) return all;
        all.sort((a, b) =>
          haversineMeters(region.latitude, region.longitude, a.latitude, a.longitude) -
          haversineMeters(region.latitude, region.longitude, b.latitude, b.longitude)
        );
        return all.slice(0, 500);
      });
    } catch (e) {
      captureError(e, { context: 'fetchSpotsInRegion' });
    }
    setLoading(false);
    lastFetchRegionRef.current = region;
    return fetched;
  }, []);

  // 報告後に現在リージョンのスポットを再取得して鮮度を反映
  const handleProximitySpotUpdated = useCallback(() => {
    if (lastFetchRegionRef.current) {
      fetchSpotsForRegion(lastFetchRegionRef.current);
    }
  }, [fetchSpotsForRegion]);

  // refreshTrigger 変化時 → 全置換で再取得（削除されたスポットもマップから消える）
  const prevTrigger = useRef(refreshTrigger);
  useEffect(() => {
    if (prevTrigger.current !== refreshTrigger && lastFetchRegionRef.current) {
      prevTrigger.current = refreshTrigger;
      (async () => {
        setLoading(true);
        try {
          const fresh = await fetchSpotsInRegion(lastFetchRegionRef.current!);
          setAllSpotsRaw(fresh); // マージではなく全置換
        } catch (e) {
          captureError(e, { context: 'refreshTrigger' });
        }
        setLoading(false);
      })();
    }
  }, [refreshTrigger]);

  // 初回: 位置情報取得 → そのエリアのスポットを取得
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          const initRegion: Region = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          };
          mapRef.current?.animateToRegion(initRegion, 800);
          fetchSpotsForRegion(initRegion);
        } catch (e) {
          captureError(e, { context: 'initialLocation' });
          // GPS取得失敗 → 東京でフォールバック
          fetchSpotsForRegion(JAPAN_CENTER);
        }
      } else {
        // 位置情報拒否 → 東京中心でフェッチ + ユーザーに通知
        setLocationDenied(true);
        fetchSpotsForRegion(JAPAN_CENTER);
      }
    })();
    logActivity();
  }, []);

  // タブ2度押しリセット
  useImperativeHandle(ref, () => ({
    resetView: () => {
      setSelected(null);

      if (lastLocationRef.current) {
        mapRef.current?.animateToRegion({
          ...lastLocationRef.current,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }, 600);
      } else if (locationGranted) {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((loc) => {
            lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            mapRef.current?.animateToRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }, 600);
          })
          .catch((e) => captureError(e, { context: 'resetView' }));
      }
    },
  }), [locationGranted]);

  // お気に入りからのジャンプ
  useEffect(() => {
    if (!focusSpot) return;
    const spot = focusSpot;
    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: spot.latitude,
        longitude: spot.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 800);
      setTimeout(() => setSelected(spot), 900);
      onFocusConsumed?.();
    }, 400);
    return () => clearTimeout(timer);
  }, [focusSpot]);

  // ── 現在地へ移動 ──────────────────────────────────────
  const goToCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
      return;
    }
    setLocationGranted(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    mapRef.current?.animateToRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    }, 600);
  };

  // ── 最寄りスポット ────────────────────────────────────
  const goToNearestSpot = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
      return;
    }
    setLocationGranted(true);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = loc.coords;
    const all = ccFilterEnabled ? filterByCC(allSpotsRaw, userCC) : allSpotsRaw;
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
    miscTimerRef.current = setTimeout(() => setSelected(nearest), 900);
  };

  // ── 住所検索 ──────────────────────────────────────────
  const handleSearch = async () => {
    const q = searchText.trim();
    if (!q) return;
    // 即座にキーボード＆検索バーを閉じる
    Keyboard.dismiss();
    setSearchFocused(false);
    setSearchVisible(false);
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        Alert.alert('見つかりませんでした', `「${q}」に該当する場所が見つかりません。`);
        setSearching(false);
        return;
      }
      const { latitude, longitude } = results[0];
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // まず広めのリージョンでジャンプ＋自動フェッチ
      const searchRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };
      mapRef.current?.animateToRegion(searchRegion, 800);

      // ジャンプ先エリアのスポットを geohash 範囲検索
      const freshSpots = await fetchSpotsForRegion(searchRegion);

      // 検索地点周辺のスポット件数を通知
      const filtered = ccFilterEnabled ? filterByCC(freshSpots, userCC) : freshSpots;
      const nearby = filtered
        .map((s) => ({ spot: s, dist: haversineMeters(latitude, longitude, s.latitude, s.longitude) }))
        .sort((a, b) => a.dist - b.dist);

      const NEARBY_RADIUS = 3000;
      const nearbyCount = nearby.filter((n) => n.dist <= NEARBY_RADIUS).length;

      if (nearbyCount > 0) {
        setSearchResultMsg(`${nearbyCount}件の駐輪場が近くにあります`);
      } else if (nearby.length > 0) {
        const km = (nearby[0].dist / 1000).toFixed(1);
        setSearchResultMsg(`最寄りの駐輪場まで約${km}km`);
      } else {
        setSearchResultMsg('この付近に登録済みの駐輪場はありません');
      }

      miscTimerRef.current = setTimeout(() => setSearchResultMsg(null), 4000);
    } catch {
      Alert.alert('エラー', '検索に失敗しました。');
    }
    setSearching(false);
  };

  // ── SearchOverlay からの検索結果ハンドラ ──────────────
  const handleSearchResult = useCallback(async (result: SearchResult) => {
    setSearchVisible(false);
    setSearching(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const searchRegion: Region = {
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
    mapRef.current?.animateToRegion(searchRegion, 800);

    const freshSpots = await fetchSpotsForRegion(searchRegion);
    const filtered = ccFilterEnabled ? filterByCC(freshSpots, userCC) : freshSpots;
    const NEARBY_RADIUS = 3000;
    const nearbyCount = filtered
      .filter(s => haversineMeters(result.latitude, result.longitude, s.latitude, s.longitude) <= NEARBY_RADIUS)
      .length;

    setAreaSummary({
      areaName: result.areaName,
      spotCount: nearbyCount,
    });
    setSearching(false);
  }, [userCC]);

  // ── 最後に変化完了した region を保持（再検索ボタン用）
  const currentRegionRef = useRef<Region>(JAPAN_CENTER);

  // ── カメラ移動追跡 + エリア自動再検索 ──────────────
  const autoFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRegionChangeComplete = (region: Region) => {
    currentRegionRef.current = region;
    if (!lastFetchRegionRef.current) { lastFetchRegionRef.current = region; return; }

    // 前回取得リージョンから十分移動した場合のみ自動再検索（デバウンス 800ms）
    if (autoFetchTimerRef.current) clearTimeout(autoFetchTimerRef.current);
    autoFetchTimerRef.current = setTimeout(() => {
      const prev = lastFetchRegionRef.current!;
      const moved = haversineMeters(prev.latitude, prev.longitude, region.latitude, region.longitude);
      // 表示範囲の30%以上移動したら再検索
      const threshold = Math.max(region.latitudeDelta, region.longitudeDelta) * 111_000 * 0.3;
      if (moved > threshold) {
        fetchSpotsForRegion(region);
      }
    }, 800);
  };


  // ── クイックレポート「写真1枚で即登録」 ─────────────
  const [reportLoading, setReportLoading] = useState(false);

  const handleQuickReport = async () => {
    if (reportLoading) return;
    try {
      // 1. GPS取得
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
        return;
      }
      setLocationGranted(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;

      // 2. カメラ起動（使えない場合はライブラリから選択）
      const photoUri = await pickPhotoFromCamera();
      if (!photoUri) return;

      // 3. 住所を自動取得
      setReportLoading(true);
      let address = '';
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) address = [geo.region, geo.city, geo.street, geo.streetNumber].filter(Boolean).join(' ');
      } catch {}

      // 4. 即座に登録（CC/料金/台数は未確認）
      const name = address ? `${address} 付近` : `${latitude.toFixed(4)}, ${longitude.toFixed(4)} 付近`;
      const spotData = {
        name,
        latitude,
        longitude,
        address: address || undefined,
        maxCC: null as MaxCC,
        isFree: null as boolean | null,
      };
      const localId = await insertUserSpot(spotData);
      addUserSpotToFirestore(localId, spotData).catch((e) => {
        captureError(e, { context: 'quickReport_firestore' });
      });

      // 5. 写真をレビューとしてアップロード（バイク情報付き）
      if (user) {
        const bike = await getFirstVehicle();
        addReview(`user_${localId}`, user.userId, 0, undefined, photoUri, undefined, bike?.name).catch((e) => {
          captureError(e, { context: 'quickReport_photo' });
        });
      }

      // 6. マップにピン追加
      const newPin: ParkingPin = {
        id: `user_${localId}`,
        name,
        latitude,
        longitude,
        maxCC: null,
        isFree: null,
        capacity: null,
        source: 'user',
        address: spotData.address,
        updatedAt: new Date().toISOString(),
      };
      setAllSpotsRaw((prev) => [...prev, newPin]);
      mapRef.current?.animateToRegion({
        latitude, longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      }, 600);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSearchResultMsg('スポットを共有しました!');
      miscTimerRef.current = setTimeout(() => setSearchResultMsg(null), 3000);
    } catch (e: unknown) {
      captureError(e, { context: 'quickReport' });
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('エラー', `登録に失敗しました: ${message}`);
    }
    setReportLoading(false);
  };

  const allSpotsBase = ccFilterEnabled ? filterByCC(allSpotsRaw, userCC) : allSpotsRaw;
  // チュートリアル中はダミースポットを注入
  const allSpots = tutorial.active
    ? [tutorial.dummySpot, ...allSpotsBase]
    : allSpotsBase;

  // チュートリアル: 探すフェーズ開始でマップを東京駅に移動
  const prevTutorialActive = useRef(tutorial.active);
  useEffect(() => {
    if (tutorial.isStep('explore-pillbar') || tutorial.isStep('scene-explore')) {
      mapRef.current?.animateToRegion({
        latitude: tutorial.dummySpot.latitude,
        longitude: tutorial.dummySpot.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 800);
    }
  }, [tutorial.active, tutorial.stepIndex]);

  // チュートリアル終了後: GPS現在地に移動
  useEffect(() => {
    if (prevTutorialActive.current && !tutorial.active) {
      // チュートリアルが終了した
      setSelected(null);
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            setLocationGranted(true);
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            mapRef.current?.animateToRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }, 800);
            // 現在地周辺のスポットをフェッチ
            fetchSpotsForRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.06,
              longitudeDelta: 0.06,
            });
          }
        } catch {}
      })();
    }
    prevTutorialActive.current = tutorial.active;
  }, [tutorial.active]);

  // チュートリアル: 詳細シート表示ステップで自動選択
  useEffect(() => {
    if (tutorial.isStep('explore-nav')) {
      if (!selected) setSelected(tutorial.dummySpot);
    }
    if (tutorial.isStep('explore-close-sheet')) {
      setSelected(null);
    }
  }, [tutorial.active, tutorial.stepIndex]);

  // チュートリアル: カメラボタンの位置を登録
  const cameraBtnRef = useRef<View>(null);
  useEffect(() => {
    if (tutorial.active && cameraBtnRef.current) {
      setTimeout(() => {
        cameraBtnRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0) tutorial.registerTarget('camera-button', { x, y, w, h, borderRadius: 26 });
        });
      }, 500);
    }
  }, [tutorial.active, tutorial.stepIndex]);

  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  const dismissSearch = () => {
    Keyboard.dismiss();
    setSearchFocused(false);
    setSearchVisible(false);
    setSearchText('');
  };

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color={SYS_BLUE} />
            <Text style={styles.loadingText}>スポット読み込み中...</Text>
          </View>
        </View>
      )}

      {/* ── 位置情報拒否バナー ─────────────────────────── */}
      {locationDenied && (
        <View style={styles.deniedBanner} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.deniedBannerInner}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.8}
            accessibilityLabel="位置情報が無効です。タップして設定を開く"
            accessibilityRole="button"
            accessibilityHint="端末の設定画面を開いて位置情報を許可します"
          >
            <Ionicons name="location-outline" size={16} color="#FF9F0A" />
            <Text style={styles.deniedBannerText}>位置情報が無効です — タップして設定を開く</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── スポット0件メッセージ ──────────────────────── */}
      {!loading && allSpots.length === 0 && !emptyDismissed && (
        <TouchableOpacity
          style={styles.emptyOverlay}
          activeOpacity={1}
          onPress={() => setEmptyDismissed(true)}
        >
          <View style={styles.emptyBadge}>
            <Ionicons name="map-outline" size={32} color={SYS_GRAY} />
            <Text style={styles.emptyTitle}>このエリアにはまだスポットがありません</Text>
            <Text style={styles.emptySubtitle}>最初の発見者になろう！{'\n'}右下の「＋」ボタンからスポットを登録できます</Text>
            <Text style={styles.emptyDismissHint}>タップで閉じる</Text>
          </View>
        </TouchableOpacity>
      )}
      <ClusteredMapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={JAPAN_CENTER}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        showsCompass={false}
        customMapStyle={DARK_MAP_STYLE}
        onRegionChangeComplete={handleRegionChangeComplete}
        clusterColor="#0A84FF"
        clusterTextColor="#fff"
        clusterFontFamily={undefined}
        radius={60}
        minZoomLevel={0}
        maxZoomLevel={20}
        extent={512}
        animationEnabled={false}
        renderCluster={(cluster) => {
          const { id, geometry, onPress, properties } = cluster;
          const count = properties.point_count;
          return (
            <Marker
              key={`cluster-${id}`}
              coordinate={{ latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] }}
              onPress={onPress}
            >
              <View style={[styles.cluster, count >= 50 && styles.clusterLarge]}>
                <Text style={styles.clusterText}>{count}</Text>
              </View>
            </Marker>
          );
        }}
      >
        {allSpots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            onPress={() => setSelected(spot)}
            accessibilityLabel={`${spot.name}${spot.isFree === true ? '、無料' : spot.isFree === false ? '、有料' : ''}`}
          >
            <SpotPin spot={spot} />
          </Marker>
        ))}
      </ClusteredMapView>

      {/* 暗幕は SearchOverlay が担当 */}

      {/* ── トースト ─────────────────────────────────── */}
      {searchResultMsg && (
        <View style={styles.toastWrapper}>
          <View style={styles.toast}>
            <Ionicons
              name={searchResultMsg.includes('ありません') ? 'alert-circle' : 'checkmark-circle'}
              size={15}
              color={searchResultMsg.includes('ありません') ? '#FF9F0A' : '#30D158'}
            />
            <Text style={styles.toastText}>{searchResultMsg}</Text>
          </View>
        </View>
      )}

      {/* ── ライブフィード（上部） ────────────────────── */}
      {!selected && !searchVisible && liveFeedEnabled && <LiveFeed />}

      {/* ── 最寄りスポットリスト（上部） ─────────────────── */}
      {!selected && !searchVisible && (
        <NearbySpotsList
          alternatives={
            tutorial.active && tutorial.phase === 'explore'
              ? [{ spot: tutorial.dummySpot, distanceM: 120 }, ...getNearbyAlternatives(undefined, 2)]
              : getNearbyAlternatives(undefined, 3)
          }
          onLocationPress={goToCurrentLocation}
          onSpotPress={(spot) => {
            mapRef.current?.animateToRegion({
              latitude: spot.latitude, longitude: spot.longitude,
              latitudeDelta: 0.005, longitudeDelta: 0.005,
            }, 800);
            miscTimerRef.current = setTimeout(() => setSelected(spot), 900);
          }}
          onSearchPress={() => setSearchVisible(true)}
          areaSummary={areaSummary}
          onClearSearch={() => {
            setAreaSummary(null);
            goToCurrentLocation();
          }}
          ccFilterEnabled={ccFilterEnabled}
          userCC={userCC}
          onToggleCcFilter={onToggleCcFilter}
        />
      )}

      {/* ── 近接コンテキストカード (#90) ─────────────────── */}
      {!selected && !searchVisible && (
        <ProximityContextCard
          proximityState={proximityState}
          getNearbyAlternatives={getNearbyAlternatives}
          onQuickReport={handleQuickReport}
          onSpotUpdated={handleProximitySpotUpdated}
        />
      )}

      {/* ── カメラピル（下部: パシャで登録） ──────────────── */}
      {!searchVisible && !selected && (
        <TouchableOpacity
          ref={cameraBtnRef}
          style={styles.cameraPill}
          onPress={() => {
            if (tutorial.isStep('register-camera')) {
              tutorial.advanceTutorial();
              return;
            }
            handleQuickReport();
          }}
          activeOpacity={0.8}
          accessibilityLabel="写真で新しいスポットを登録"
          accessibilityRole="button"
          accessibilityHint="カメラを起動して写真1枚でスポットを登録します"
        >
          <Ionicons name="camera" size={20} color="#F2F2F7" />
        </TouchableOpacity>
      )}

      {/* ── DEV: 温度テストボタン ───────────────────── */}
      {__DEV__ && !searchVisible && !selected && (
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 120, left: 16, backgroundColor: '#FF6B00', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, zIndex: 9999, elevation: 9999 }}
          onPress={async () => {
            const targets = allSpots.slice(0, 5);
            for (const s of targets) {
              await reportParked(s.id);
            }
            Alert.alert('温度テスト', `${targets.length}件のスポットをhotにしました。マップを再読み込みしてください。`);
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>🔥 温度テスト</Text>
        </TouchableOpacity>
      )}

      {/* ── 検索オーバーレイ（未来検索） ────────────────── */}
      <SearchOverlay
        visible={searchVisible}
        onDismiss={() => setSearchVisible(false)}
        onSearchResult={handleSearchResult}
      />

      {/* ── 登録中インジケーター ───────────────────── */}
      {reportLoading && (
        <View style={styles.reportingOverlay} pointerEvents="none">
          <View style={styles.reportingBadge}>
            <ActivityIndicator size="small" color="#FF6B00" />
            <Text style={styles.reportingText}>共有中...</Text>
          </View>
        </View>
      )}

      {/* ── 詳細シート（地図タップで閉じる） ────────────── */}
      {selected && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setSelected(null)}
          />
          <SpotDetailSheet
            spot={selected}
            onClose={() => setSelected(null)}
            onSetDestination={setDestination}
          />
        </View>
      )}
    </View>
  );
}); // forwardRef 終端

const { height: SCREEN_H } = Dimensions.get('window');
const TAB_BAR_H = Platform.OS === 'android' ? 56 : 82;
const BOTTOM_BASE = TAB_BAR_H + 2; // タブバー直上にぴったり

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── 暗幕（検索フォーカス中） ──────────────────────
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 1,
  },

  // ── カメラピル（下部） ─────────────────────────────
  cameraPill: {
    position: 'absolute',
    right: 14,
    bottom: BOTTOM_BASE + 10,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 5,
  },

  // ── 詳細シート背景（タップで閉じる） ────────────────
  sheetBackdrop: {
    flex: 1,
  },

  // ── 検索バー（下部、キーボード追従） ──────────────
  searchRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(28,28,30,0.94)',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,  // グローブ対応: 大きめ
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  searchBarFocused: {
    backgroundColor: 'rgba(28,28,30,0.98)',
    borderColor: 'rgba(10,132,255,0.4)',
  },
  searchInput: {
    flex: 1,
    color: '#F2F2F7',
    fontSize: 16,  // グローブ対応: 大きめフォント
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 6,  // グローブ対応: タップ領域拡大
  },
  cancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  cancelText: {
    color: SYS_BLUE,
    fontSize: 15,
    fontWeight: '600',
  },

  // ── トースト ──────────────────────────────────────
  toastWrapper: {
    position: 'absolute',
    top: '45%',
    left: 0, right: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,30,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  toastText: {
    color: '#F2F2F7',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── クラスター ─────────────────────────────────────
  cluster: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(10,132,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
  },
  clusterLarge: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,159,10,0.85)',
    shadowColor: '#FF9F0A',
  },
  clusterText: {
    color: '#fff', fontSize: 13, fontWeight: '800',
  },

  // ── 登録中インジケーター ─────────────────────────────
  reportingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 15,
  },
  reportingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(28,28,30,0.95)',
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)',
  },
  reportingText: { color: '#FF6B00', fontSize: 14, fontWeight: '600' },

  // ── マーカー ──────────────────────────────────────
  pin: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 3, elevation: 4,
  },
  pinText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // ── ローディングバッジ ────────────────────────────
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 120, zIndex: 10,
  },
  loadingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(28,28,30,0.92)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
  },
  loadingText: { color: '#AEAEB2', fontSize: 12 },
  // 位置情報拒否バナー
  deniedBanner: {
    position: 'absolute', top: 54, left: 16, right: 16, zIndex: 20,
    alignItems: 'center',
  },
  deniedBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(28,28,30,0.95)',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,159,10,0.3)',
  },
  deniedBannerText: { color: '#FF9F0A', fontSize: 13, fontWeight: '600' },
  // スポット0件
  emptyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  emptyBadge: {
    alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(28,28,30,0.92)',
    paddingHorizontal: 24, paddingVertical: 20,
    borderRadius: 16, maxWidth: 280,
  },
  emptyTitle: { color: '#F2F2F7', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: '#8E8E93', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyDismissHint: { color: '#636366', fontSize: 11, marginTop: 4 },

});
