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
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, UserCC, MaxCC } from '../types';
import { filterByCC } from '../data/adachi-parking';
import { Spacing } from '../constants/theme';
import { fetchSpotsInRegion, addUserSpotToFirestore, addReview, logActivity } from '../firebase/firestoreService';
import { insertUserSpot, getUserRank } from '../db/database';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { SpotDetailSheet } from '../components/SpotDetailSheet';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';
import { LiveFeed } from '../components/LiveFeed';
import { useProximityState } from '../hooks/useProximityState';
import { ProximityContextCard } from '../components/ProximityContextCard';
import { NearbySpotsList } from '../components/NearbySpotsList';

// GPS取得前の初期表示: 日本全体（東京偏りを感じさせない）
const JAPAN_CENTER: Region = {
  latitude: 36.0,
  longitude: 138.0,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

const SYS_BLUE = '#0A84FF';
const SYS_GRAY = '#636366';

/** 鮮度ベースのピンカラー（CLAUDE.md §鮮度可視化） */
function markerColor(spot: ParkingPin): string {
  if (spot.source === 'user') return '#BF5AF2'; // ユーザー投稿は常に紫

  if (spot.updatedAt) {
    const ageMs = Date.now() - new Date(spot.updatedAt).getTime();
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    if (ageMs < ONE_MONTH)     return '#0A84FF'; // 青: 1ヶ月以内（信頼）
    if (ageMs < ONE_MONTH * 3) return '#FFD60A'; // 黄: 3ヶ月以内（注意）
    if (ageMs >= ONE_MONTH * 6) return '#FF453A'; // 赤: 6ヶ月以上（要確認）
  }

  // updatedAt なし or 3-6ヶ月: デフォルトカラー（排気量ベース）
  if (spot.maxCC === null)    return SYS_BLUE;
  if (spot.maxCC >= 250)     return '#30D158';
  if (spot.maxCC >= 125)     return SYS_BLUE;
  return '#8E8E93';
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

// ── 24h以内更新のピンに脈動アニメーション ────────────
const FRESH_MS = 24 * 60 * 60 * 1000; // 24時間

function isFresh(spot: ParkingPin): boolean {
  if (!spot.updatedAt) return false;
  return Date.now() - new Date(spot.updatedAt).getTime() < FRESH_MS;
}

function SpotPin({ spot }: { spot: ParkingPin }) {
  const fresh = isFresh(spot);
  const pulse = useRef(new RNAnimated.Value(1)).current;
  const entrance = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    // マウント時バウンスイン
    RNAnimated.spring(entrance, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (!fresh) return;
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [fresh]);

  const color = markerColor(spot);
  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <RNAnimated.View style={{ alignItems: 'center', justifyContent: 'center', width: 44, height: 44, transform: [{ scale }], opacity: entrance }}>
      {fresh && (
        <RNAnimated.View
          style={{
            position: 'absolute',
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: color,
            opacity: 0.25,
            transform: [{ scale: pulse }],
          }}
        />
      )}
      <View style={[styles.pin, { backgroundColor: color }]}>
        <Text style={styles.pinText}>{spot.source === 'user' ? '★' : 'P'}</Text>
      </View>
    </RNAnimated.View>
  );
}

/** App.tsx から ref 経由で呼び出せるメソッド */
export interface MapScreenHandle {
  resetView: () => void;
}

interface Props {
  userCC: UserCC;
  onChangeCC?: (cc: UserCC) => void;
  focusSpot?: ParkingPin | null;
  onFocusConsumed?: () => void;
  refreshTrigger?: number;
  onRegisterTutorialTarget?: (key: string, rect: { x: number; y: number; w: number; h: number; borderRadius?: number }) => void;
}

export const MapScreen = forwardRef<MapScreenHandle, Props>(function MapScreen(
  { userCC, onChangeCC, focusSpot, onFocusConsumed, refreshTrigger, onRegisterTutorialTarget },
  ref
) {
  const user = useUser();
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

  // ── 検索 ──────────────────────────────────────────────
  const [searchVisible, setSearchVisible]     = useState(false); // ラジアルから開閉
  const [searchText, setSearchText]           = useState('');
  const [searching, setSearching]             = useState(false);
  const [searchResultMsg, setSearchResultMsg] = useState<string | null>(null);

  // ── ライブフィード設定 ──────────────────────────────
  const [liveFeedEnabled, setLiveFeedEnabled] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem('moto_logos_live_feed').then((v) => setLiveFeedEnabled(v !== 'false'));
  }, []);

  // ── FAB コーチマーク ────────────────────────────────
  const [showCoach, setShowCoach] = useState(false);

  // FABメニュー「にゅっ」アニメーション
  const fabMenuAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem('fab_coach_shown').then((v) => {
      if (!v) setShowCoach(true);
    });
  }, []);

  const dismissCoach = () => {
    setShowCoach(false);
    AsyncStorage.setItem('fab_coach_shown', '1');
  };

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
      // 既存データとマージ（新エリア分を追加、同一IDは上書き）
      setAllSpotsRaw((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        for (const s of fetched) map.set(s.id, s);
        return Array.from(map.values());
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
    setTimeout(() => setSelected(nearest), 900);
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

      setTimeout(() => setSearchResultMsg(null), 4000);
    } catch {
      Alert.alert('エラー', '検索に失敗しました。');
    }
    setSearching(false);
  };

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

  // ── FABメニュー（長押しで開く） ───────────────────────
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const openFabMenu = () => {
    setFabMenuOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    RNAnimated.spring(fabMenuAnim, {
      toValue: 1,
      tension: 200,
      friction: 14,
      useNativeDriver: true,
    }).start();
  };

  const closeFabMenu = () => {
    RNAnimated.timing(fabMenuAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setFabMenuOpen(false));
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
      let result: ImagePicker.ImagePickerResult | null = null;
      try {
        const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (camStatus === 'granted') {
          result = await ImagePicker.launchCameraAsync({
            quality: 0.7,
            allowsEditing: true,
            aspect: [4, 3],
          });
        }
      } catch {
        // シミュレータ等でカメラ非対応 → ライブラリにフォールバック
      }
      if (!result) {
        const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libStatus !== 'granted') {
          Alert.alert('写真へのアクセスが必要です', '設定から許可してください。');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsEditing: true,
          aspect: [4, 3],
        });
      }
      if (result.canceled) return;
      const photoUri = result.assets[0].uri;

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
      const rank = await getUserRank();
      addUserSpotToFirestore(localId, spotData, rank).catch((e) => {
        captureError(e, { context: 'quickReport_firestore' });
      });

      // 5. 写真をレビューとしてアップロード
      if (user) {
        addReview(`user_${localId}`, user.userId, 0, undefined, photoUri).catch((e) => {
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
      setTimeout(() => setSearchResultMsg(null), 3000);
    } catch (e: any) {
      captureError(e, { context: 'quickReport' });
      Alert.alert('エラー', `登録に失敗しました: ${e?.message ?? e}`);
    }
    setReportLoading(false);
  };

  const allSpots = filterByCC(allSpotsRaw, userCC);


  // ── キーボード追従アニメーション ───────────────────
  const [searchFocused, setSearchFocused] = useState(false);
  const kbOffset = useRef(new RNAnimated.Value(0)).current;
  const overlayOpacity = useRef(new RNAnimated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      RNAnimated.parallel([
        RNAnimated.timing(kbOffset, {
          toValue: h - TAB_BAR_H,
          duration: Platform.OS === 'ios' ? e.duration : 250,
          useNativeDriver: false,
        }),
        RNAnimated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      RNAnimated.parallel([
        RNAnimated.timing(kbOffset, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 250,
          useNativeDriver: false,
        }),
        RNAnimated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    });

    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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
          >
            <SpotPin spot={spot} />
          </Marker>
        ))}
      </ClusteredMapView>

      {/* ── 暗幕オーバーレイ（検索フォーカス中） ──────── */}
      {searchFocused && (
        <RNAnimated.View
          style={[styles.dimOverlay, { opacity: overlayOpacity }]}
          pointerEvents="none"
        />
      )}

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
      {!selected && !searchFocused && liveFeedEnabled && <LiveFeed />}

      {/* ── 最寄りスポットリスト（上部） ─────────────────── */}
      {!selected && !searchFocused && (
        <NearbySpotsList
          alternatives={getNearbyAlternatives(undefined, 3)}
          onSpotPress={(spot) => {
            mapRef.current?.animateToRegion({
              latitude: spot.latitude, longitude: spot.longitude,
              latitudeDelta: 0.005, longitudeDelta: 0.005,
            }, 800);
            setTimeout(() => setSelected(spot), 900);
          }}
        />
      )}

      {/* ── 近接コンテキストカード (#90) ─────────────────── */}
      {!selected && !searchFocused && (
        <ProximityContextCard
          proximityState={proximityState}
          getNearbyAlternatives={getNearbyAlternatives}
          onQuickReport={() => { dismissCoach(); handleQuickReport(); }}
          onSpotUpdated={handleProximitySpotUpdated}
        />
      )}

      {/* ── 現在地ボタン（右下） ─────────────────────────── */}
      {!searchFocused && !selected && (
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={goToCurrentLocation}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={22} color="#F2F2F7" />
        </TouchableOpacity>
      )}

      {/* ── FABコーチマーク（吹き出し） ────────────────── */}
      {!searchFocused && !selected && showCoach && !fabMenuOpen && (
        <TouchableOpacity style={styles.coachBubble} onPress={dismissCoach} activeOpacity={0.8}>
          <Text style={styles.coachText}>長押しでメニュー</Text>
          <View style={styles.coachArrow} />
        </TouchableOpacity>
      )}

      {/* ── FABメニュー背景タップで閉じる ────────────────── */}
      {fabMenuOpen && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={closeFabMenu}
        />
      )}

      {/* ── FAB オレンジボタン（長押しでメニュー） ──────── */}
      {!searchFocused && !selected && (
        <View style={styles.fabArea} pointerEvents="box-none">
          {/* メニュー（にゅっとスプリング） */}
          {fabMenuOpen && (
            <RNAnimated.View style={[
              styles.fabMenu,
              {
                opacity: fabMenuAnim,
                transform: [{
                  translateY: fabMenuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                }, {
                  scale: fabMenuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                }],
              },
            ]}>
              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={() => {
                  closeFabMenu();
                  setSearchVisible(true);
                  setSearchText('');
                  setTimeout(() => searchInputRef.current?.focus(), 200);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="search" size={18} color="#F2F2F7" />
                <Text style={styles.fabMenuText}>文字で探す</Text>
              </TouchableOpacity>
              <View style={styles.fabMenuDivider} />
              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={() => {
                  closeFabMenu();
                  dismissCoach();
                  handleQuickReport();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={18} color="#F2F2F7" />
                <Text style={styles.fabMenuText}>場所を登録</Text>
              </TouchableOpacity>
            </RNAnimated.View>
          )}
          <TouchableOpacity
            style={styles.fab}
            onLongPress={() => { dismissCoach(); openFabMenu(); }}
            onPress={() => { dismissCoach(); if (fabMenuOpen) closeFabMenu(); }}
            delayLongPress={250}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── 下部: 検索バー（ラジアルから開閉、キーボード追従） */}
      {searchVisible && (
      <RNAnimated.View style={[styles.searchRow, { bottom: RNAnimated.add(BOTTOM_BASE, kbOffset) }]}>
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Ionicons name="search" size={16} color={searchFocused ? '#E5E5EA' : SYS_GRAY} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="住所・地名で検索"
            placeholderTextColor={SYS_GRAY}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={SYS_BLUE} />
          ) : searchText.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchText('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={20} color={SYS_GRAY} />
            </TouchableOpacity>
          ) : null}
        </View>
        {searchFocused && (
          <TouchableOpacity style={styles.cancelBtn} onPress={dismissSearch} activeOpacity={0.7}>
            <Text style={styles.cancelText}>閉じる</Text>
          </TouchableOpacity>
        )}
      </RNAnimated.View>
      )}

      {/* ── 登録中インジケーター ───────────────────── */}
      {reportLoading && (
        <View style={styles.reportingOverlay} pointerEvents="none">
          <View style={styles.reportingBadge}>
            <ActivityIndicator size="small" color="#FF6B00" />
            <Text style={styles.reportingText}>共有中...</Text>
          </View>
        </View>
      )}

      {/* ── 詳細シート ────────────────────────────────── */}
      {selected && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <SpotDetailSheet
            spot={selected}
            onClose={() => setSelected(null)}
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

  // ── FAB オレンジボタン + メニュー ──────────────────
  fabArea: {
    position: 'absolute',
    right: 14,
    bottom: BOTTOM_BASE + 10,
    alignItems: 'center',
    zIndex: 5,
  },
  fab: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FF6B00',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  fabMenu: {
    marginBottom: 10,
    backgroundColor: 'rgba(28,28,30,0.96)',
    borderRadius: 14,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 12,
    minWidth: 160,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fabMenuText: {
    color: '#F2F2F7',
    fontSize: 15,
    fontWeight: '600',
  },
  fabMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
  },
  coachBubble: {
    position: 'absolute',
    bottom: BOTTOM_BASE + 10 + 64 + 8, // FABの上
    right: 6,
    backgroundColor: 'rgba(28,28,30,0.96)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,0,0.4)',
    zIndex: 10,
  },
  coachText: {
    color: '#FF6B00', fontSize: 13, fontWeight: '700',
  },
  coachArrow: {
    position: 'absolute',
    bottom: -6,
    right: 28,
    width: 12, height: 12,
    backgroundColor: 'rgba(28,28,30,0.96)',
    transform: [{ rotate: '45deg' }],
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,0,0.4)',
  },

  // ── 現在地ボタン ──────────────────────────────────
  locationBtn: {
    position: 'absolute',
    right: 14,
    bottom: BOTTOM_BASE + 10 + 64 + 14, // FABの上
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.94)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
    zIndex: 4,
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
