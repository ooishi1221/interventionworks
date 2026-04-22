import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  Keyboard,
  Dimensions,
  Linking,
} from 'react-native';
import MapView, { Marker, Region, Circle } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { ParkingPin, UserCC, MaxCC } from '../types';
import { filterByCC } from '../data/adachi-parking';
import { Spacing } from '../constants/theme';
import { fetchSpotsInRegion, addUserSpotToFirestore, addReview, logActivity } from '../firebase/firestoreService';
import { loadSpotsFromCacheIfFresh, syncSpotsCache, downloadAllSpotsToCache } from '../firebase/spotsCacheSync';
import { readSpotsFromCache } from '../db/spotsCache';
import { getFirebaseAuth } from '../firebase/config';
import { DEBUG_ALERT } from '../utils/debug';
import { insertUserSpot, getFirstVehicle, getFootprintCount, addFootprint } from '../db/database';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { SpotDetailSheet } from '../components/SpotDetailSheet';
import { OneshotCeremony } from '../components/OneshotCeremony';
import { captureError } from '../utils/sentry';
import { moderatePhotoRemote } from '../utils/moderation';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import { haversineMeters } from '../utils/distance';
import { useUser } from '../contexts/UserContext';
import { SearchOverlay, SearchResult } from '../components/SearchOverlay';
import { SearchResultsList } from '../components/SearchResultsList';
import { useTutorial, TUTORIAL_NEARBY_RESULTS, DUMMY_SPOT } from '../contexts/TutorialContext';
import { LinkNudgeCard } from '../components/LinkNudgeCard';
import { BetaFeedbackButton } from '../components/BetaFeedbackButton';
import { getNavigationTarget } from '../utils/navigationState';
import { cleanupGeofence } from '../utils/geofenceService';
import type { CenterButtonContext } from '../types/centerButton';

// GPS取得前のフォールバック: 東京中心（首都圏ユーザーが大半）
const TOKYO_FALLBACK: Region = {
  latitude: 35.6812,
  longitude: 139.7671,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const LAST_LOCATION_KEY = 'moto_logos_last_location';

const SYS_BLUE = '#0A84FF';
const SYS_GRAY = '#8E8E93';

import { FRESHNESS_STYLE, spotFreshness, clusterFreshness } from '../utils/freshness';
import type { SpotFreshness } from '../utils/freshness';

// ─── スポットピン（鮮度で色+透明度。選択時は強調） ────────
const SpotPin = React.memo(function SpotPin({
  spot,
  wide,
  selected,
  navigating,
}: {
  spot: ParkingPin;
  wide?: boolean;
  selected?: boolean;
  navigating?: boolean;
}) {
  const fresh = spotFreshness(spot);

  // 選択中: オレンジで強調、サイズ1.5倍、外側に発光リング
  if (selected) {
    return (
      <View style={styles.selectedWrapper}>
        <View style={styles.selectedRingOuter} />
        <View style={styles.selectedRingInner} />
        <View style={styles.pinSelected}>
          <FontAwesome5 name="motorcycle" size={18} color="#fff" />
        </View>
      </View>
    );
  }

  // 案内中: オレンジ発光（選択時より控えめ）
  if (navigating) {
    return (
      <View style={[styles.pinLarge, styles.pinNavigating]}>
        <FontAwesome5 name="motorcycle" size={14} color="#fff" />
      </View>
    );
  }

  const { color, textColor } = FRESHNESS_STYLE[fresh];
  const isSilent = fresh === 'silent';
  // live は最も目立たせる（薄グロー）、その他はフラット
  const isHighlighted = fresh === 'live';

  if (wide) {
    // 広域ズーム: 小ドット
    return (
      <View
        style={[
          styles.pinDot,
          isSilent
            ? { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#9A9A9E' }
            : {
                backgroundColor: color,
                borderWidth: 2,
                borderColor: '#fff',
                ...(isHighlighted ? styles.glow : null),
              },
        ]}
      />
    );
  }

  // 通常ピン: アイコン付き円形
  return (
    <View
      style={[
        styles.pinLarge,
        isSilent
          ? { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#9A9A9E' }
          : {
              backgroundColor: color,
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.5)',
              ...(isHighlighted ? styles.glow : null),
            },
      ]}
    >
      <FontAwesome5 name="motorcycle" size={14} color={textColor} />
    </View>
  );
});

/** App.tsx から ref 経由で呼び出せるメソッド */
export interface MapScreenHandle {
  resetView: () => void;
  triggerOneShot: () => void;
  searchNearby: () => void;
  openTextSearch: () => void;
  selectAndShowSpot: (spot: ParkingPin) => void;
  refreshNavigation: () => void;
}

type SearchPhase = 'idle' | 'nearby' | 'text';

interface Props {
  userCC: UserCC;
  onChangeCC?: (cc: UserCC) => void;
  focusSpot?: ParkingPin | null;
  focusReviewId?: string;
  onFocusConsumed?: () => void;
  refreshTrigger?: number;
  searchPhase?: SearchPhase;
  onSearchPhaseChange?: (phase: SearchPhase) => void;
  ceremonyEnabled?: boolean;
  nickname?: string;
  /** ワンショットセレモニー完了時（チュートリアル外）のコールバック。通知プロンプト発火に使う */
  onOneshotCompleted?: () => void;
  /** 中央ボタンのコンテキスト（近くのスポット or 新規登録）を親に通知 */
  onCenterButtonContextChange?: (ctx: CenterButtonContext) => void;
  /** スポット詳細シートの表示状態を親に通知 */
  onSpotDetailVisible?: (visible: boolean) => void;
}

export const MapScreen = forwardRef<MapScreenHandle, Props>(function MapScreen(
  { userCC, onChangeCC, focusSpot, focusReviewId, onFocusConsumed, refreshTrigger, searchPhase = 'idle', onSearchPhaseChange, ceremonyEnabled = true, nickname, onOneshotCompleted, onCenterButtonContextChange, onSpotDetailVisible },
  ref
) {
  const user = useUser();
  const tutorial = useTutorial();
  const { showPicker, PickerSheet } = usePhotoPicker();
  const mapRef = useRef<MapView>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const superClusterRef = useRef<any>(null);
  const [initialRegion, setInitialRegion] = useState<Region>(TOKYO_FALLBACK);
  const [allSpotsRaw, setAllSpotsRaw]     = useState<ParkingPin[]>([]);
  const [loading, setLoading]             = useState(true);
  const fetchingRef = useRef(false);
  const [gpsLoading, setGpsLoading]       = useState(true);
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const [selected, setSelected]           = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locationDenied, setLocationDenied]   = useState(false);
  const [wideZoom, setWideZoom]               = useState(true);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navTrigger, setNavTrigger] = useState(0);
  const [navTargetId, setNavTargetId] = useState<string | null>(null);
  const nearbyFabRef = useRef<View>(null);

  // スポット詳細シートの表示状態を親に通知
  useEffect(() => {
    onSpotDetailVisible?.(selected !== null);
  }, [selected, onSpotDetailVisible]);

  /**
   * スポット選択時にピンがシート (Peek 28%) で隠れない位置に来るよう地図をオフセット。
   * ピンを「可視マップ領域の中央」(画面上から 36%) に配置する。
   * 画面中央 (50%) から上 14% に動かす = 地図の中央緯度を南にずらす = -offsetLat。
   * 加えて、クラスタリング解除のためズームを強くする (0.005〜)。
   */
  const selectSpotWithOffset = useCallback((spot: ParkingPin | null) => {
    if (!spot) { setSelected(null); return; }
    const targetDelta = 0.015; // クラスタ展開と同じ引き
    const offsetLat = targetDelta * 0.14;
    mapRef.current?.animateToRegion({
      latitude: spot.latitude - offsetLat, // 中央を南にずらす = ピンは画面の上
      longitude: spot.longitude,
      latitudeDelta: targetDelta,
      longitudeDelta: targetDelta,
    }, 500);
    setSelected(spot);
  }, []);

  // ── 検索 ──────────────────────────────────────────────
  const [searchVisible, setSearchVisible]     = useState(false);
  const [searchText, setSearchText]           = useState('');
  const [searching, setSearching]             = useState(false);
  const [searchResultMsg, setSearchResultMsg] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<{
    photoUri: string; spotName: string; footprintCount: number;
  } | null>(null);

  // setTimeout リーク防止用 ref
  const miscTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (miscTimerRef.current) clearTimeout(miscTimerRef.current); }, []);

  // ── サーチ結果（最寄りリスト用） ──────────────────────
  const [searchResults, setSearchResults] = useState<{ spot: ParkingPin; distanceM: number }[]>([]);
  const [searchAreaName, setSearchAreaName] = useState<string | null>(null);

  const lastFetchRegionRef = useRef<Region | null>(null);

  /**
   * 指定リージョンの geohash 範囲で Firestore からスポットを取得。
   * 既存スポットにマージ（同一ID上書き）して重複なくピンを蓄積する。
   */
  const fetchSpotsForRegion = useCallback(async (region: Region): Promise<ParkingPin[]> => {
    if (fetchingRef.current) { setLoading(false); return []; }
    fetchingRef.current = true;
    setLoading(true);
    let fetched: ParkingPin[] = [];
    try {
      fetched = await fetchSpotsInRegion(region);
      if (DEBUG_ALERT) {
        const auth = getFirebaseAuth();
        const uid = auth.currentUser?.uid?.slice(0, 8) ?? 'null';
        Alert.alert(
          'DEBUG fetch結果',
          `uid=${uid}\nregion=${region.latitude.toFixed(3)},${region.longitude.toFixed(3)}\ndelta=${region.latitudeDelta.toFixed(3)}\nfetched=${fetched.length}件`,
        );
      }
      // 既存データとマージ（新エリア分を追加、同一IDは上書き、遠方を除外）
      setAllSpotsRaw((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        let changed = false;
        for (const s of fetched) {
          const existing = map.get(s.id);
          if (!existing || existing.updatedAt !== s.updatedAt
              || existing.lastConfirmedAt !== s.lastConfirmedAt) {
            map.set(s.id, s);
            changed = true;
          }
        }
        if (!changed) return prev; // 変更なし → 同じ参照で再レンダー回避
        const all = Array.from(map.values());
        if (all.length <= 500) return all;
        // 距離を事前計算してソート（比較関数内の重複haversine排除）
        const dist = new Map<string, number>();
        for (const s of all) {
          dist.set(s.id, haversineMeters(region.latitude, region.longitude, s.latitude, s.longitude));
        }
        all.sort((a, b) => dist.get(a.id)! - dist.get(b.id)!);
        return all.slice(0, 500);
      });
    } catch (e) {
      captureError(e, { context: 'fetchSpotsInRegion' });
      if (DEBUG_ALERT) {
        const auth = getFirebaseAuth();
        const uid = auth.currentUser?.uid?.slice(0, 8) ?? 'null';
        Alert.alert(
          'fetchSpots エラー',
          `uid=${uid}\n${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    setLoading(false);
    fetchingRef.current = false;
    lastFetchRegionRef.current = region;
    return fetched;
  }, []);

  // 報告後に現在リージョンのスポットを再取得して気配を反映
  // 楽観的更新: 該当スポットの lastConfirmedAt を即座にローカルで now に上書き
  //             → ピンが即座に黄色（live）になる。Firestore 再取得の遅延を吸収。
  const handleProximitySpotUpdated = useCallback((spotId?: string) => {
    if (spotId) {
      const nowIso = new Date().toISOString();
      setAllSpotsRaw((prev) =>
        prev.map((s) => (s.id === spotId ? { ...s, lastConfirmedAt: nowIso } : s))
      );
      // selected も表示中なら同期
      setSelected((sel) => (sel && sel.id === spotId ? { ...sel, lastConfirmedAt: nowIso } : sel));
    }
    if (lastFetchRegionRef.current) {
      fetchSpotsForRegion(lastFetchRegionRef.current);
    }
  }, [fetchSpotsForRegion]);

  // ── 周辺検索（フロートボタン + ref共用） ──────────────
  const doSearchNearby = useCallback(async () => {
    // マップ中心を優先（ユーザーがパンした先で検索）。ズームレベルは維持
    const cur = currentRegionRef.current;
    let lat = cur?.latitude;
    let lon = cur?.longitude;
    if (!lat || !lon) {
      // フォールバック: GPS
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
      } catch {
        return;
      }
    }
    // 現在の表示デルタを保持（なければデフォルト）
    const delta = cur?.latitudeDelta ?? 0.06;
    const region: Region = { latitude: lat, longitude: lon, latitudeDelta: delta, longitudeDelta: delta };
    const freshSpots = await fetchSpotsForRegion(region);
    const filtered = filterByCC(freshSpots, userCC);
    const sorted = filtered
      .map(s => ({ spot: s, distanceM: haversineMeters(lat!, lon!, s.latitude, s.longitude) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);
    setSearchResults(sorted);
    setSearchAreaName(null);
  }, [fetchSpotsForRegion, userCC]);

  // ── ワンショットセレモニー ────────────────────────────
  const ceremonyCooldown = useRef(false);
  // セレモニー開始時のスポットを覚えて、完了後にカードを再オープンする
  const pendingCardSpotRef = useRef<ParkingPin | null>(null);
  const handleOneshotCeremony = useCallback(async (data: { photoUri: string; spotName: string; spot?: ParkingPin }) => {
    if (ceremonyCooldown.current) return;
    ceremonyCooldown.current = true;
    // セレモニー完了後に再オープンするスポットを保存（selected または明示的に渡された spot）
    pendingCardSpotRef.current = data.spot ?? selected ?? null;
    setSelected(null); // シートを先に閉じて地図を見せる
    if (!ceremonyEnabled) {
      // 演出OFF → セレモニーをスキップ。カードだけ即再オープン
      setTimeout(() => { ceremonyCooldown.current = false; }, 1000);
      if (pendingCardSpotRef.current) {
        const spotToReopen = pendingCardSpotRef.current;
        pendingCardSpotRef.current = null;
        setTimeout(() => selectSpotWithOffset(spotToReopen), 100);
      }
      return;
    }
    const count = await getFootprintCount().catch(() => 0);
    setCeremony({ ...data, footprintCount: count });
    setTimeout(() => { ceremonyCooldown.current = false; }, 3500);
  }, [ceremonyEnabled, selected, selectSpotWithOffset]);

  const handleCeremonyComplete = useCallback(() => {
    setCeremony(null);
    // チュートリアル: セレモニー完了で次へ
    if (tutorial.isStep('oneshot-ceremony')) {
      tutorial.advanceTutorial(); // → oneshot-result
      pendingCardSpotRef.current = null;
      return;
    }
    // 実ワンショット完了: 該当スポットのカードを再オープン
    const spotToReopen = pendingCardSpotRef.current;
    pendingCardSpotRef.current = null;
    if (spotToReopen) {
      setTimeout(() => selectSpotWithOffset(spotToReopen), 250);
    } else {
      setSelected(null);
    }
    // 実ワンショット完了 → 通知プロンプト発火（App側で必要時のみカード表示）
    onOneshotCompleted?.();
  }, [tutorial, onOneshotCompleted, selectSpotWithOffset]);

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

  // 初回: キャッシュ即時表示 → AsyncStorage+GPS並列 → バックグラウンド同期
  useEffect(() => {
    if (DEBUG_ALERT) Alert.alert('DEBUG3 Map起動', 'MapScreen.useEffect 開始');
    (async () => {
      // Phase 0: SQLite キャッシュから即時表示（<10ms）
      let hasCache = false;
      try {
        const cachedSpots = await loadSpotsFromCacheIfFresh();
        if (cachedSpots && cachedSpots.length > 0) {
          setAllSpotsRaw(cachedSpots);
          setLoading(false);
          hasCache = true;
        }
      } catch { /* ignore */ }

      // Phase 1: AsyncStorage復元 + GPS許可状態の取得（要求はしない）
      // 起動直後にシステムダイアログを出さない方針 — 許可は周辺検索FABタップ等の
      // 文脈で初めてユーザーに求める。ここでは既存の許可状態を取得するのみ。
      const [savedData, permResult] = await Promise.all([
        AsyncStorage.getItem(LAST_LOCATION_KEY).catch(() => null),
        Location.getForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const })),
      ]);

      // Phase 2: 保存位置があれば地図移動 + Firestoreフェッチ（fire-and-forget）
      let hasSavedRegion = false;
      let savedLat = 0;
      let savedLon = 0;
      if (savedData) {
        try {
          const { lat, lon } = JSON.parse(savedData);
          savedLat = lat;
          savedLon = lon;
          const savedRegion: Region = { latitude: lat, longitude: lon, latitudeDelta: 0.04, longitudeDelta: 0.04 };
          setInitialRegion(savedRegion);
          mapRef.current?.animateToRegion(savedRegion, 0);
          if (!hasCache) fetchSpotsForRegion(savedRegion); // fire-and-forget（awaitしない）
          hasSavedRegion = true;
        } catch { /* ignore */ }
      }

      if (!hasCache && !hasSavedRegion) {
        fetchSpotsForRegion(TOKYO_FALLBACK); // fire-and-forget
      }

      // Phase 3: GPS取得（5秒タイムアウト）
      if (permResult.status === 'granted') {
        setLocationGranted(true);
        try {
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('GPS_TIMEOUT')), 5000),
            ),
          ]);
          lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setCurrentUserLocation(lastLocationRef.current);
          const gpsRegion: Region = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          };
          mapRef.current?.animateToRegion(gpsRegion, 800);
          // 保存位置と近い場合は再fetchスキップ
          if (!hasSavedRegion || haversineMeters(
            gpsRegion.latitude, gpsRegion.longitude,
            savedLat, savedLon,
          ) > 500) {
            if (!hasCache) fetchSpotsForRegion(gpsRegion);
          }
          AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat: loc.coords.latitude, lon: loc.coords.longitude }));
        } catch (e) {
          if (e instanceof Error && e.message === 'GPS_TIMEOUT') {
            captureError(e, { context: 'gps_timeout' });
          } else {
            captureError(e, { context: 'initialLocation' });
          }
          if (!hasCache && !hasSavedRegion) fetchSpotsForRegion(TOKYO_FALLBACK);
        }
      } else {
        setLocationDenied(true);
        if (!hasCache && !hasSavedRegion) fetchSpotsForRegion(TOKYO_FALLBACK);
      }
      setGpsLoading(false);

      // Phase 4: バックグラウンドでキャッシュ更新（24h経過時のみ）
      syncSpotsCache().catch((e) => captureError(e, { context: 'bg_cache_sync' }));
    })();
    logActivity();
  }, []);

  // タブ2度押しリセット（現在地移動 + スポット再取得）
  useImperativeHandle(ref, () => ({
    resetView: () => {
      setSelected(null);
      setSearchVisible(false);
      setSearchResults([]);
      setSearchAreaName(null);

      if (lastLocationRef.current) {
        const region = {
          ...lastLocationRef.current,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        };
        mapRef.current?.animateToRegion(region, 600);
        fetchSpotsForRegion(region);
      } else if (locationGranted) {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((loc) => {
            lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setCurrentUserLocation(lastLocationRef.current);
            const region = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            };
            mapRef.current?.animateToRegion(region, 600);
            fetchSpotsForRegion(region);
          })
          .catch((e) => captureError(e, { context: 'resetView' }));
      }
    },
    triggerOneShot: () => {
      quickReportRef.current();
    },
    searchNearby: doSearchNearby,
    openTextSearch: () => {
      setSearchVisible(true);
    },
    selectAndShowSpot: (spot: ParkingPin) => {
      selectSpotWithOffset(spot);
    },
    refreshNavigation: () => {
      setNavTrigger((n) => n + 1);
    },
  }), [locationGranted, fetchSpotsForRegion, doSearchNearby, tutorial, selectSpotWithOffset]);

  // ── 中央ボタンコンテキスト計算 ────────────────────
  useEffect(() => {
    if (tutorial.active) {
      onCenterButtonContextChange?.({ mode: 'new-spot' });
      return;
    }
    let cancelled = false;
    (async () => {
      const loc = currentUserLocation;

      // 案内中のスポット（バナー表示用 + ピンハイライト用。距離に関係なく常に取得）
      const navTarget = await getNavigationTarget();
      if (!cancelled) setNavTargetId(navTarget?.id ?? null);
      const navSpotForBanner = navTarget
        ? (allSpotsRaw.find((s) => s.id === navTarget.id) ?? { id: navTarget.id, name: navTarget.name, latitude: navTarget.latitude, longitude: navTarget.longitude, maxCC: null, isFree: null, capacity: null, source: 'seed' as const })
        : undefined;

      if (!loc) {
        if (!cancelled) onCenterButtonContextChange?.({ mode: 'new-spot', activeNavName: navTarget?.name, activeNavSpot: navSpotForBanner });
        return;
      }

      // 案内先が 200m 以内なら中央ボタンも案内先を優先
      if (navTarget && !cancelled) {
        const dist = haversineMeters(loc.latitude, loc.longitude, navTarget.latitude, navTarget.longitude);
        if (dist <= 200) {
          onCenterButtonContextChange?.({
            mode: 'nav-target',
            spotName: navTarget.name,
            spot: navSpotForBanner!,
            activeNavName: navTarget.name,
            activeNavSpot: navSpotForBanner,
          });
          return;
        }
      }

      // 最寄りの既存スポット (200m以内)
      let nearest: ParkingPin | null = null;
      let nearestDist = Infinity;
      for (const s of allSpotsRaw) {
        const d = haversineMeters(loc.latitude, loc.longitude, s.latitude, s.longitude);
        if (d <= 200 && d < nearestDist) {
          nearest = s;
          nearestDist = d;
        }
      }

      if (!cancelled) {
        if (nearest) {
          onCenterButtonContextChange?.({ mode: 'nearest-spot', spotName: nearest.name, spot: nearest, activeNavName: navTarget?.name, activeNavSpot: navSpotForBanner });
        } else {
          onCenterButtonContextChange?.({ mode: 'new-spot', activeNavName: navTarget?.name, activeNavSpot: navSpotForBanner });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserLocation, allSpotsRaw, tutorial.active, onCenterButtonContextChange, navTrigger]);

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
    setLocationDenied(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    lastLocationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    setCurrentUserLocation(lastLocationRef.current);
    const region = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
    mapRef.current?.animateToRegion(region, 600);
    // 現在地周辺のスポットも再取得
    fetchSpotsForRegion(region);
  };

  // ── 最寄りスポット ────────────────────────────────────
  const goToNearestSpot = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
      return;
    }
    setLocationGranted(true);
    setLocationDenied(false);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = loc.coords;
    const all = filterByCC(allSpotsRaw, userCC);
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
      const filtered = filterByCC(freshSpots, userCC);
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
    const filtered = filterByCC(freshSpots, userCC);
    const sorted = filtered
      .map(s => ({ spot: s, distanceM: haversineMeters(result.latitude, result.longitude, s.latitude, s.longitude) }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);

    setSearchResults(sorted);
    setSearchAreaName(result.areaName);
    onSearchPhaseChange?.('nearby');
    setSearching(false);
  }, [userCC, onSearchPhaseChange]);

  // ── 最後に変化完了した region を保持（再検索ボタン用）
  const currentRegionRef = useRef<Region>(initialRegion);

  // ── カメラ移動追跡 + エリア自動再検索 ──────────────
  const autoFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRegionChangeComplete = (region: Region) => {
    currentRegionRef.current = region;
    clusterFreshnessCache.current.clear(); // ズーム変更でクラスタ再生成 → キャッシュ破棄
    // ヒステリシス付き広域モード切替（バタつき防止）
    // wide→通常: 0.04以下、通常→wide: 0.06以上。境界帯(0.04〜0.06)では状態維持
    const delta = region.latitudeDelta;
    setWideZoom((prev) => {
      if (prev && delta < 0.04) return false;
      if (!prev && delta > 0.06) return true;
      return prev;
    });
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
  const quickReportRef = useRef<() => void>(() => {});
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
      setLocationDenied(false);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;

      // 2. カメラ起動（使えない場合はライブラリから選択）
      const photoUri = await showPicker();
      if (!photoUri) return;

      // 2.5 事前モデレーション（公序良俗違反を弾く）
      const mod = await moderatePhotoRemote(photoUri);
      if (!mod.approved) {
        Alert.alert(
          '投稿できません',
          mod.rationale || 'この写真はコミュニティガイドラインに反する可能性があります。別の写真をお試しください。',
        );
        return;
      }

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
        addReview(`user_${localId}`, user.userId, 1, undefined, photoUri, undefined, bike?.name, undefined, nickname).catch((e) => {
          captureError(e, { context: 'quickReport_photo' });
        });
      }

      // 6. 足跡として記録（ライダー画面のワンショットタップから戻れるように）
      addFootprint(`user_${localId}`, name, latitude, longitude, 'parked').catch((e) => {
        captureError(e, { context: 'quickReport_footprint' });
      });

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
      // セレモニー演出（ハプティックはセレモニー内）+ 新規ピンを完了後に再オープン
      handleOneshotCeremony({ photoUri, spotName: name, spot: newPin });
      // ジオフェンスクリーンアップ（新規登録でも到着扱い）
      cleanupGeofence().catch(() => {});
    } catch (e: unknown) {
      captureError(e, { context: 'quickReport' });
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('エラー', `登録に失敗しました: ${message}`);
    }
    setReportLoading(false);
  };
  quickReportRef.current = handleQuickReport;

  const allSpots = useMemo(() => {
    const base = filterByCC(allSpotsRaw, userCC);
    if (!tutorial.active) return base;
    // チュートリアル中はダミースポットを注入
    return [tutorial.dummySpot, ...base];
  }, [allSpotsRaw, userCC, tutorial.active, tutorial.dummySpot]);

  // 座標→気配ルックアップ（クラスタ集約用）
  const coordFreshnessMap = useMemo(() => {
    const m = new Map<string, SpotFreshness>();
    for (const s of allSpots) {
      m.set(`${s.latitude},${s.longitude}`, spotFreshness(s));
    }
    return m;
  }, [allSpots]);

  // クラスタ気配キャッシュ（cluster_id → dominant freshness）
  const clusterFreshnessCache = useRef(new Map<number, SpotFreshness>());

  // 気配 live（1ヶ月以内）のスポット — 広域ズームでは描画しない
  const clearedSpots = useMemo(
    () => wideZoom ? [] : allSpots.filter((s) => spotFreshness(s) === 'live'),
    [allSpots, wideZoom],
  );

  // チュートリアル開始時: 現在の画面状態（開いてるシート・検索結果など）を
  // リセットして、地図を東京駅にワープしてから始める。
  // これをしないとユーザーが開いたSpotDetailSheetの上からチュートリアルが
  // 被さり、「どこにいるんだっけ」を失った状態で手順に入ってしまう。
  const prevTutorialActiveForStartRef = useRef(tutorial.active);
  useEffect(() => {
    const wasInactive = !prevTutorialActiveForStartRef.current;
    prevTutorialActiveForStartRef.current = tutorial.active;
    if (tutorial.active && wasInactive) {
      setSelected(null);
      setSearchResults([]);
      setSearchAreaName(null);
      onSearchPhaseChange?.('idle');
      mapRef.current?.animateToRegion(
        {
          latitude: TOKYO_FALLBACK.latitude,
          longitude: TOKYO_FALLBACK.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        600,
      );
    }
  }, [tutorial.active, onSearchPhaseChange]);

  // チュートリアル中: セットアップphaseでバックグラウンドキャッシュDL
  useEffect(() => {
    if (!tutorial.active || tutorial.phase !== 'setup') return;
    let cancelled = false;
    (async () => {
      try {
        const count = await downloadAllSpotsToCache();
        if (!cancelled && count > 0) {
          const spots = await readSpotsFromCache();
          if (!cancelled && spots.length > 0) {
            setAllSpotsRaw(spots);
            setLoading(false);
          }
        }
      } catch (e) {
        captureError(e, { context: 'tutorial_cache_download' });
      }
    })();
    return () => { cancelled = true; };
  }, [tutorial.active, tutorial.phase]);

  // チュートリアル: 探すフェーズ開始でマップを東京駅に移動
  const prevTutorialActive = useRef(tutorial.active);
  useEffect(() => {
    if (tutorial.isStep('explore-nearby') || tutorial.isStep('scene-explore')) {
      mapRef.current?.animateToRegion({
        latitude: tutorial.dummySpot.latitude,
        longitude: tutorial.dummySpot.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 1200);
    }
  }, [tutorial.active, tutorial.stepIndex]);

  // チュートリアル: 周辺検索FABのターゲット登録
  useEffect(() => {
    if (!tutorial.active || !nearbyFabRef.current) return;
    const measure = () => {
      nearbyFabRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (w > 0) tutorial.registerTarget('nearby-fab', { x, y, w, h, borderRadius: 28 });
      });
    };
    setTimeout(measure, 500);
  }, [tutorial.active, tutorial.stepIndex]);

  // チュートリアル終了後: GPS現在地に移動
  useEffect(() => {
    if (prevTutorialActive.current && !tutorial.active) {
      // チュートリアルが終了した
      setSelected(null);
      (async () => {
        let lat = TOKYO_FALLBACK.latitude;
        let lng = TOKYO_FALLBACK.longitude;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            setLocationGranted(true);
            setLocationDenied(false);
            const loc = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('GPS_TIMEOUT')), 5000),
              ),
            ]);
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
            lastLocationRef.current = { latitude: lat, longitude: lng };
            setCurrentUserLocation(lastLocationRef.current);
          }
        } catch (e) {
          captureError(e, { context: 'tutorial_end_gps' });
        }
        mapRef.current?.animateToRegion({
          latitude: lat, longitude: lng,
          latitudeDelta: 0.03, longitudeDelta: 0.03,
        }, 800);
        await fetchSpotsForRegion({
          latitude: lat, longitude: lng,
          latitudeDelta: 0.06, longitudeDelta: 0.06,
        });
      })();
    }
    prevTutorialActive.current = tutorial.active;
  }, [tutorial.active]);

  // チュートリアル: ステップごとのUI制御
  useEffect(() => {
    if (!tutorial.active) return;

    // explore-nav: SpotDetailSheet 自動表示
    if (tutorial.isStep('explore-nav')) {
      if (!selected) setSelected(tutorial.dummySpot);
    }
    // explore-banner: シートを閉じてバナー+ピンを見せる + ピンをオレンジに
    if (tutorial.isStep('explore-banner')) {
      setSelected(null);
      setSearchResults([]);
      setNavTargetId(tutorial.dummySpot.id);
    }
    // explore-search: サーチタブ説明（SearchOverlayも確実に閉じる）
    if (tutorial.isStep('explore-search')) {
      setSelected(null);
      setSearchResults([]);
      setSearchVisible(false);
    }
    // scene-oneshot 以降: ピンオレンジ解除 + SearchOverlay確実に閉じ
    if (tutorial.isStep('scene-oneshot')) {
      setNavTargetId(null);
      setSelected(null);
      setSearchVisible(false);
    }
    // oneshot-do: ダミースポットカードを自動表示 → ワンショットボタンをスポットライト
    if (tutorial.isStep('oneshot-do')) {
      if (!selected) {
        setTimeout(() => selectSpotWithOffset(tutorial.dummySpot), 800);
      }
    }
    // oneshot-result 以降: シートを閉じる
    if (tutorial.isStep('oneshot-result') || tutorial.isStep('scene-newspot') || tutorial.isStep('newspot-explain') || tutorial.isStep('newspot-ai')) {
      setSelected(null);
    }
    // scene-presence: 検索結果を閉じて地図を見せる
    if (tutorial.isStep('scene-presence')) {
      setSelected(null);
      setSearchResults([]);
    }
  }, [tutorial.active, tutorial.stepIndex]);

  // チュートリアル: カメラボタンの位置登録は App.tsx のタブバー側に移動済み

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
      {/* ローディングインジケータ — チュートリアル中は非表示、通常時は左上に小スピナー */}
      {!tutorial.active && (loading || gpsLoading) && (
        <View style={styles.loadingTopLeft} pointerEvents="none">
          <ActivityIndicator size="small" color={SYS_BLUE} />
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
        superClusterRef={superClusterRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        showsCompass={false}
        customMapStyle={DARK_MAP_STYLE}
        onRegionChangeComplete={handleRegionChangeComplete}
        preserveClusterPressBehavior
        onClusterPress={(cluster) => {
          // クラスタが解ける直前くらいの引きで寄る（最小delta保証）
          const sc = superClusterRef.current;
          if (!sc) return;
          const leaves = sc.getLeaves(cluster.id, Infinity) as {
            geometry: { coordinates: [number, number] };
          }[];
          if (leaves.length === 0) return;
          let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
          for (const l of leaves) {
            const lat = l.geometry.coordinates[1];
            const lng = l.geometry.coordinates[0];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
          const MIN_DELTA = 0.015; // クラスタ解除直前くらいの引き
          const latDelta = Math.max((maxLat - minLat) * 1.8, MIN_DELTA);
          const lngDelta = Math.max((maxLng - minLng) * 1.8, MIN_DELTA);
          const centerLat = (minLat + maxLat) / 2;
          const centerLng = (minLng + maxLng) / 2;
          mapRef.current?.animateToRegion({
            latitude: centerLat,
            longitude: centerLng,
            latitudeDelta: latDelta,
            longitudeDelta: lngDelta,
          }, 500);
        }}
        clusterColor="#0A84FF"
        clusterTextColor="#fff"
        clusterFontFamily={undefined}
        radius={50}
        minZoomLevel={0}
        maxZoomLevel={20}
        extent={512}
        clusteringEnabled
        animationEnabled={false}
        renderCluster={(cluster) => {
          const { id, geometry, onPress, properties } = cluster;
          const count = properties.point_count;

          // ── 気配集約: キャッシュ優先 → なければ getLeaves で計算 ──
          let dominant: SpotFreshness = 'cold';
          const cid = properties.cluster_id as number | undefined;
          if (cid != null) {
            const cached = clusterFreshnessCache.current.get(cid);
            if (cached) {
              dominant = cached;
            } else {
              try {
                const sc = superClusterRef.current;
                if (sc) {
                  const leaves = sc.getLeaves(cid, Infinity) as {
                    geometry: { coordinates: [number, number] };
                  }[];
                  const levels: SpotFreshness[] = [];
                  for (const leaf of leaves) {
                    const key = `${leaf.geometry.coordinates[1]},${leaf.geometry.coordinates[0]}`;
                    const f = coordFreshnessMap.get(key);
                    if (f) levels.push(f);
                  }
                  if (levels.length > 0) dominant = clusterFreshness(levels);
                  clusterFreshnessCache.current.set(cid, dominant);
                }
              } catch {
                // supercluster 未初期化時は cold フォールバック
              }
            }
          }

          const freshStyle = FRESHNESS_STYLE[dominant];
          // 3段階サイズ: 小(〜5) / 中(6〜19) / 大(20+)
          const sizeStyle = count >= 20
            ? styles.clusterLg
            : count >= 6
              ? styles.clusterMd
              : styles.clusterSm;

          return (
            <Marker
              key={`cluster-${id}`}
              coordinate={{ latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] }}
              onPress={onPress}
              tracksViewChanges={false}
            >
              <View style={[
                styles.clusterBase,
                sizeStyle,
                { backgroundColor: dominant === 'silent' ? 'rgba(154,154,158,0.5)' : freshStyle.color },
              ]}>
                <Text style={[styles.clusterText, { color: freshStyle.textColor }]}>
                  {count}
                </Text>
              </View>
            </Marker>
          );
        }}
      >
        {/* 通常ピン: 選択中・案内中は除外してクラスタリング対象に */}
        {allSpots
          .filter((spot) => spot.id !== selected?.id && spot.id !== navTargetId)
          .map((spot) => (
            // key に lastConfirmedAt を含めることで気配が変わった瞬間に Marker を
            // 再マウント → native bitmap が新色で撮り直される。tracksViewChanges=false
            // のままでも色変化が反映される。
            <Marker
              key={`${spot.id}-${spot.lastConfirmedAt ?? 's'}`}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              onPress={() => selectSpotWithOffset(spot)}
              anchor={{ x: 0.5, y: 0.5 }}
              accessibilityLabel={`${spot.name}${spot.isFree === true ? '、無料' : spot.isFree === false ? '、有料' : ''}`}
              zIndex={1}
              tracksViewChanges={false}
            >
              <SpotPin spot={spot} wide={wideZoom} />
            </Marker>
          ))}
        {/* 新鮮スポット周囲のハロー（黄の薄グロー） */}
        {clearedSpots.map((spot) => (
          <Circle
            key={`clear_${spot.id}`}
            center={{ latitude: spot.latitude, longitude: spot.longitude }}
            radius={250}
            fillColor="rgba(255,214,10,0.06)"
            strokeColor="rgba(255,214,10,0.18)"
            strokeWidth={1}
          />
        ))}
        {/* 案内中ピン: クラスタリング対象外・常にオレンジ発光 */}
        {navTargetId && navTargetId !== selected?.id && (() => {
          const navSpot = allSpots.find((s) => s.id === navTargetId);
          if (!navSpot) return null;
          return (
            <Marker
              key={`nav_${navSpot.id}`}
              coordinate={{ latitude: navSpot.latitude, longitude: navSpot.longitude }}
              onPress={() => selectSpotWithOffset(navSpot)}
              anchor={{ x: 0.5, y: 0.5 }}
              accessibilityLabel={`${navSpot.name} (案内中)`}
              zIndex={90}
              tracksViewChanges={false}
              {...{ cluster: false } as any}
            >
              <SpotPin spot={navSpot} wide={false} navigating />
            </Marker>
          );
        })()}
        {/* 選択中ピン: クラスタリング対象外で常に強調表示 */}
        {selected && (
          <Marker
            key={`selected_${selected.id}-${selected.lastConfirmedAt ?? 's'}`}
            coordinate={{ latitude: selected.latitude, longitude: selected.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={`${selected.name} (選択中)`}
            zIndex={100}
            tracksViewChanges={false}
            {...{ cluster: false } as any}
          >
            <SpotPin spot={selected} wide={false} selected />
          </Marker>
        )}
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

      {/* ── サーチ結果リスト（フローティング） ──────────── */}
      {searchResults.length > 0 && !selected && (
        <SearchResultsList
          items={searchResults}
          areaName={searchAreaName}
          topOffset={navTargetId ? 46 : 0}
          onSpotPress={(spot) => {
            // selectSpotWithOffset が地図オフセットと選択を同時に行う
            miscTimerRef.current = setTimeout(() => selectSpotWithOffset(spot), 400);
            // チュートリアル: 結果タップで次のステップへ
            if (tutorial.isStep('explore-result')) {
              tutorial.advanceTutorial();
            }
          }}
          onClear={() => {
            // × でリストだけ閉じる。地図位置は今見ているエリアのまま維持
            setSearchResults([]);
            setSearchAreaName(null);
            onSearchPhaseChange?.('idle');
          }}
        />
      )}

      {/* ── アカウント連携ナッジ ───────────────────────── */}
      {!selected && !searchVisible && <LinkNudgeCard />}

      {/* ── 周辺検索フロートボタン（右下） ──────────────── */}
      {(!searchVisible && !selected) && (
        <TouchableOpacity
          ref={nearbyFabRef}
          style={[styles.nearbyFab, searchResults.length > 0 && styles.nearbyFabActive]}
          onPress={() => {
            // チュートリアル: 東京駅周辺ダミー3件を注入
            if (tutorial.isStep('explore-nearby')) {
              setSearchResults(TUTORIAL_NEARBY_RESULTS);
              tutorial.advanceTutorial();
              return;
            }
            if (searchResults.length > 0) {
              setSearchResults([]);
              setSearchAreaName(null);
              onSearchPhaseChange?.('idle');
            } else {
              onSearchPhaseChange?.('nearby');
              doSearchNearby();
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={searchResults.length > 0 ? 'close' : 'locate-outline'} size={28} color="#0A84FF" />
        </TouchableOpacity>
      )}

      {!searchVisible && !selected && <BetaFeedbackButton />}

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
            onSpotUpdated={handleProximitySpotUpdated}
            onOneshotCeremony={handleOneshotCeremony}
            onNavChanged={() => setNavTrigger((n) => n + 1)}
            highlightReviewId={focusReviewId}
            nickname={nickname}
          />
        </View>
      )}
      <PickerSheet />
      <OneshotCeremony
        visible={!!ceremony}
        photoUri={ceremony?.photoUri ?? null}
        spotName={ceremony?.spotName ?? ''}
        footprintCount={ceremony?.footprintCount ?? 0}
        onComplete={handleCeremonyComplete}
      />
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

  // ── 検索ピル（タブバー直上） ─────────────────────────
  searchPill: {
    position: 'absolute',
    bottom: BOTTOM_BASE + 12,
    alignSelf: 'center',
    left: 40,
    right: 40,
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,30,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    zIndex: 5,
  },
  searchPillText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '500',
  },

  // ── 周辺検索フロートボタン ──────────────────────────
  nearbyFab: {
    position: 'absolute',
    right: 16,
    bottom: BOTTOM_BASE + 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 5,
  },

  nearbyFabActive: {
    borderColor: 'rgba(10,132,255,0.4)',
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
  },
  toastText: {
    color: '#F2F2F7',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── クラスター（円 + 気配カラー + 3段階サイズ） ─────────
  clusterBase: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3 },
      default: {},
    }),
  } as const,
  clusterSm: { width: 30, height: 30, borderRadius: 15 } as const,
  clusterMd: { width: 38, height: 38, borderRadius: 19 } as const,
  clusterLg: { width: 46, height: 46, borderRadius: 23 } as const,
  clusterText: {
    fontSize: 12, fontWeight: '800' as const,
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
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3 },
      default: {},
    }),
  },
  pinLarge: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  pinLargeText: { fontSize: 13, color: '#fff', fontWeight: '800' },
  pinDot: {
    width: 22, height: 22, borderRadius: 11,
  },
  // 気配 live にかける薄グロー。Android は elevation が重いので無効化（色のみで表現）
  glow: Platform.select({
    ios: {
      shadowColor: '#FFD60A',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.7,
      shadowRadius: 6,
    },
    default: {}, // Android: elevation による描画負荷を避けるため glow なし
  }) as object,
  pinText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // ── 選択中ピン: オレンジ強調 + 2重発光リング ────────
  selectedWrapper: {
    width: 80, height: 80,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedRingOuter: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,107,0,0.18)',
  },
  selectedRingInner: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,107,0,0.32)',
  },
  pinSelected: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF6B00',
    borderWidth: 3, borderColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 12 },
      default: {},
    }),
  },
  pinNavigating: {
    backgroundColor: '#FF6B00',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    ...Platform.select({
      ios: { shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8 },
      default: {},
    }),
  },

  // ── ローディング: 左上に小スピナーのみ ────────────
  loadingTopLeft: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    zIndex: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(28,28,30,0.85)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
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
