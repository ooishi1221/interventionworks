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
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  SafeAreaView,
  Image,
  FlatList,
  Dimensions,
  Linking,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, UserCC, MaxCC } from '../types';
import { filterByCC } from '../data/adachi-parking';
import { Spacing } from '../constants/theme';
import { fetchSpotsInRegion, addUserSpotToFirestore, addReview, logActivity } from '../firebase/firestoreService';
import { insertUserSpot, getUserRank } from '../db/database';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { SpotDetailSheet } from '../components/SpotDetailSheet';
import { RadialMenu } from '../components/RadialMenu';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';

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

  // ── 検索 ──────────────────────────────────────────────
  const [searchVisible, setSearchVisible]     = useState(false); // ラジアルから開閉
  const [searchText, setSearchText]           = useState('');
  const [searching, setSearching]             = useState(false);
  const [searchResultMsg, setSearchResultMsg] = useState<string | null>(null);

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

  // ── カメラ移動追跡 ─────────────────────────────────
  const handleRegionChangeComplete = (region: Region) => {
    currentRegionRef.current = region;
    if (!lastFetchRegionRef.current) lastFetchRegionRef.current = region;
  };

  // ── このエリアで再検索（ラジアルメニューから呼ばれる） ──
  const handleResearch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchSpotsForRegion(currentRegionRef.current);
  };

  // ── クイックレポート「ここに停めた！」 ─────────────
  const [reportForm, setReportForm] = useState<{
    visible: boolean;
    lat: number; lon: number; address: string;
    name: string; maxCC: MaxCC; isFree: boolean;
    capacity: string; price: string; photo: string | null;
  }>({
    visible: false, lat: 0, lon: 0, address: '',
    name: '', maxCC: null, isFree: true, capacity: '', price: '', photo: null,
  });
  const [reportLoading, setReportLoading] = useState(false);

  const MAX_CC_OPTIONS: { value: MaxCC; label: string }[] = [
    { value: null, label: '制限なし' },
    { value: 250,  label: '〜250cc' },
    { value: 125,  label: '〜125cc' },
    { value: 50,   label: '原付のみ' },
  ];

  const handleQuickReport = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
        return;
      }
      setLocationGranted(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let address = '';
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) address = [geo.region, geo.city, geo.street, geo.streetNumber].filter(Boolean).join(' ');
      } catch {}
      // フォームを開く（GPS + 住所は自動入力済み）
      setReportForm({
        visible: true, lat: latitude, lon: longitude, address,
        name: address ? `${address} 付近` : '', maxCC: null, isFree: true, capacity: '', price: '', photo: null,
      });
    } catch {
      Alert.alert('エラー', '位置情報の取得に失敗しました。');
    }
  };

  const submitReport = async () => {
    if (!reportForm.name.trim()) {
      Alert.alert('入力エラー', '名称を入力してください。');
      return;
    }
    setReportLoading(true);
    const spotData = {
      name: reportForm.name.trim(),
      latitude: reportForm.lat,
      longitude: reportForm.lon,
      address: reportForm.address || undefined,
      maxCC: reportForm.maxCC,
      isFree: reportForm.isFree,
      capacity: reportForm.capacity ? parseInt(reportForm.capacity, 10) : undefined,
      pricePerHour: reportForm.price ? parseFloat(reportForm.price) : undefined,
    };
    try {
      const localId = await insertUserSpot(spotData);
      const rank = await getUserRank();
      addUserSpotToFirestore(localId, spotData, rank).catch((e) => {
        captureError(e, { context: 'quickReport_firestore' });
        Alert.alert('同期エラー', 'クラウドへの保存に失敗しました。ネットワーク復帰後に再試行してください。');
      });
      // 写真があればレビューとして自動投稿
      if (reportForm.photo && user) {
        addReview(`user_${localId}`, user.userId, 5, '写真を共有しました', reportForm.photo).catch((e) => {
          captureError(e, { context: 'quickReport_photo' });
        });
      }
      const newPin: ParkingPin = {
        id: `user_${localId}`,
        name: spotData.name,
        latitude: spotData.latitude,
        longitude: spotData.longitude,
        maxCC: spotData.maxCC,
        isFree: spotData.isFree,
        capacity: spotData.capacity ?? null,
        source: 'user',
        address: spotData.address,
        updatedAt: new Date().toISOString(),
      };
      setAllSpotsRaw((prev) => [...prev, newPin]);
      mapRef.current?.animateToRegion({
        latitude: spotData.latitude, longitude: spotData.longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      }, 600);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReportForm((f) => ({ ...f, visible: false }));
      setSearchResultMsg('スポットを共有しました!');
      setTimeout(() => setSearchResultMsg(null), 3000);
    } catch {
      Alert.alert('エラー', '保存に失敗しました。');
    }
    setReportLoading(false);
  };

  const allSpots = filterByCC(allSpotsRaw, userCC);


  // ── 料金順リスト ──────────────────────────────────
  const [priceListOpen, setPriceListOpen] = useState(false);

  const sortedByPrice = (() => {
    if (!priceListOpen) return [];
    const loc = lastLocationRef.current;
    return allSpots
      .map((s) => ({
        ...s,
        dist: loc ? haversineMeters(loc.latitude, loc.longitude, s.latitude, s.longitude) : 0,
      }))
      .filter((s) => s.dist < 5000) // 5km以内
      .sort((a, b) => {
        // 無料が先、有料は安い順、料金不明は最後
        const pa = a.isFree ? -1 : (a.pricePerHour ?? 99999);
        const pb = b.isFree ? -1 : (b.pricePerHour ?? 99999);
        if (pa !== pb) return pa - pb;
        return a.dist - b.dist;
      })
      .slice(0, 20);
  })();

  // ── CC セレクター ──────────────────────────────────
  const [ccOpen, setCcOpen] = useState(false);
  const CC_OPTIONS: { value: UserCC; label: string; color: string; icon: string }[] = [
    { value: 50,   label: '50cc',  color: '#8E8E93', icon: '原付' },
    { value: 125,  label: '125cc', color: '#30D158', icon: '小型' },
    { value: 400,  label: '400cc', color: '#0A84FF', icon: '中型' },
    { value: null,  label: '大型',  color: '#FF9F0A', icon: '大型' },
  ];
  const ccMeta = CC_OPTIONS.find((o) => o.value === userCC) ?? CC_OPTIONS[3];
  const selectCC = (cc: UserCC) => {
    if (onChangeCC) onChangeCC(cc);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCcOpen(false);
  };

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
            <Text style={styles.emptySubtitle}>最初の発見者になろう！{'\n'}長押しメニューからスポットを登録できます</Text>
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

      {/* ── CC セレクター（左下） ────────────────────── */}
      {!searchFocused && (
        <View style={styles.ccArea} pointerEvents="box-none">
          {/* 展開パネル */}
          {ccOpen && (
            <View style={styles.ccPanel}>
              {CC_OPTIONS.map((opt) => {
                const isActive = userCC === opt.value;
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.ccOption, isActive && { backgroundColor: `${opt.color}20`, borderColor: `${opt.color}66` }]}
                    onPress={() => selectCC(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.ccOptionDot, { backgroundColor: opt.color }]} />
                    <Text style={[styles.ccOptionLabel, isActive && { color: opt.color, fontWeight: '800' }]}>{opt.label}</Text>
                    {isActive && <Ionicons name="checkmark" size={16} color={opt.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {/* CC ボタン + ¥ ボタン */}
          <View style={styles.ccRow}>
            <TouchableOpacity
              style={[styles.ccButton, { borderColor: `${ccMeta.color}55` }]}
              onPress={() => { setCcOpen((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.75}
              onLayout={(e) => (e.target as any).measureInWindow?.((x: number, y: number, w: number, h: number) => onRegisterTutorialTarget?.('ccButton', { x, y, w, h, borderRadius: 14 }))}
            >
              <View style={[styles.ccButtonDot, { backgroundColor: ccMeta.color }]} />
              <Text style={[styles.ccButtonText, { color: ccMeta.color }]}>{ccMeta.label}</Text>
              <Ionicons name={ccOpen ? 'chevron-down' : 'chevron-up'} size={14} color={ccMeta.color} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.priceBtn}
              onPress={() => { setPriceListOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.75}
            >
              <Text style={styles.priceBtnText}>¥</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── 右下ラジアルメニュー ─────────────────────── */}
      {!searchFocused && (
        <View
          style={styles.rightControls}
          pointerEvents="box-none"
          onLayout={(e) => (e.target as any).measureInWindow?.((x: number, y: number, w: number, h: number) => onRegisterTutorialTarget?.('radialMenu', { x, y, w, h, borderRadius: 28 }))}
        >
          <RadialMenu
            onGoToNearest={goToNearestSpot}
            onGoToCurrentLocation={goToCurrentLocation}
            onResearchArea={handleResearch}
            onQuickReport={handleQuickReport}
            onOpenSearch={() => {
              setSearchVisible(true);
              setSearchText('');
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
          />
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

      {/* ── 料金順ボトムシート ────────────────────────── */}
      <Modal
        visible={priceListOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPriceListOpen(false)}
      >
        <TouchableOpacity style={styles.priceOverlay} activeOpacity={1} onPress={() => setPriceListOpen(false)} />
        <View style={styles.priceSheet}>
          <View style={styles.priceHandle} />
          <View style={styles.priceHeader}>
            <Text style={styles.priceTitle}>近くの駐輪場（安い順・{ccMeta.label}対応）</Text>
            <TouchableOpacity onPress={() => setPriceListOpen(false)}>
              <Ionicons name="close-circle" size={24} color="#636366" />
            </TouchableOpacity>
          </View>
          {sortedByPrice.length === 0 ? (
            <View style={styles.priceEmpty}>
              <Text style={styles.priceEmptyText}>周辺にスポットがありません</Text>
            </View>
          ) : (
            <FlatList
              data={sortedByPrice}
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.priceItem}
                  onPress={() => {
                    setPriceListOpen(false);
                    mapRef.current?.animateToRegion({
                      latitude: item.latitude, longitude: item.longitude,
                      latitudeDelta: 0.005, longitudeDelta: 0.005,
                    }, 600);
                    setTimeout(() => setSelected(item), 700);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.priceDot, { backgroundColor: item.isFree ? '#30D158' : '#FF9F0A' }]} />
                  <View style={styles.priceInfo}>
                    <Text style={styles.priceName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.priceSub}>
                      {item.isFree ? '無料' : item.pricePerHour ? `¥${item.pricePerHour}/h` : '有料'}
                    </Text>
                  </View>
                  <Text style={styles.priceDist}>
                    {item.dist < 1000 ? `${Math.round(item.dist)}m` : `${(item.dist / 1000).toFixed(1)}km`}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── クイックレポートフォーム ─────────────────── */}
      <Modal
        visible={reportForm.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReportForm((f) => ({ ...f, visible: false }))}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setReportForm((f) => ({ ...f, visible: false }))}>
              <Text style={styles.modalCancel}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>スポットを共有</Text>
            <View style={{ width: 60 }} />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.formContent}>
              {/* 位置情報 */}
              <View style={styles.formMetaRow}>
                <Ionicons name="location" size={14} color={SYS_GRAY} />
                <Text style={styles.formMeta}>
                  {reportForm.address || `${reportForm.lat.toFixed(5)}, ${reportForm.lon.toFixed(5)}`}
                </Text>
              </View>

              {/* 名称 */}
              <Text style={styles.formLabel}>名称 *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="例: 北千住駅東口バイク置き場"
                placeholderTextColor={SYS_GRAY}
                value={reportForm.name}
                onChangeText={(v) => setReportForm((f) => ({ ...f, name: v }))}
              />

              {/* 最大排気量 */}
              <Text style={styles.formLabel}>最大排気量</Text>
              <View style={styles.formOptionRow}>
                {MAX_CC_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.formChip, reportForm.maxCC === opt.value && styles.formChipActive]}
                    onPress={() => setReportForm((f) => ({ ...f, maxCC: opt.value }))}
                  >
                    <Text style={[styles.formChipText, reportForm.maxCC === opt.value && styles.formChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 料金 */}
              <Text style={styles.formLabel}>料金</Text>
              <View style={styles.formOptionRow}>
                {[{ v: true, l: '無料' }, { v: false, l: '有料' }].map(({ v, l }) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.formChip, reportForm.isFree === v && styles.formChipActive]}
                    onPress={() => setReportForm((f) => ({ ...f, isFree: v }))}
                  >
                    <Text style={[styles.formChipText, reportForm.isFree === v && styles.formChipTextActive]}>
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!reportForm.isFree && (
                <>
                  <Text style={styles.formLabel}>料金（円/時）</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="例: 200"
                    placeholderTextColor={SYS_GRAY}
                    keyboardType="numeric"
                    value={reportForm.price}
                    onChangeText={(v) => setReportForm((f) => ({ ...f, price: v }))}
                  />
                </>
              )}

              {/* 収容台数 */}
              <Text style={styles.formLabel}>収容台数</Text>
              <TextInput
                style={styles.formInput}
                placeholder="例: 10"
                placeholderTextColor={SYS_GRAY}
                keyboardType="numeric"
                value={reportForm.capacity}
                onChangeText={(v) => setReportForm((f) => ({ ...f, capacity: v }))}
              />

              {/* 写真（任意） */}
              <Text style={styles.formLabel}>写真（任意）</Text>
              {reportForm.photo ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: reportForm.photo }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setReportForm((f) => ({ ...f, photo: null }))}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF453A" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== 'granted') {
                      Alert.alert('カメラへのアクセスが必要です');
                      return;
                    }
                    const result = await ImagePicker.launchCameraAsync({
                      quality: 0.7,
                      allowsEditing: true,
                      aspect: [4, 3],
                    });
                    if (!result.canceled) {
                      setReportForm((f) => ({ ...f, photo: result.assets[0].uri }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera" size={22} color={SYS_BLUE} />
                  <Text style={styles.photoBtnText}>写真を撮る</Text>
                </TouchableOpacity>
              )}

              {/* 送信 */}
              <TouchableOpacity
                style={[styles.formSubmit, reportLoading && { opacity: 0.6 }]}
                onPress={submitReport}
                disabled={reportLoading}
                activeOpacity={0.8}
              >
                {reportLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.formSubmitText}>仲間に共有する</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

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

  // ── CC セレクター（左下） ──────────────────────────
  ccArea: {
    position: 'absolute',
    left: 14,
    bottom: BOTTOM_BASE,
    alignItems: 'flex-start',
  },
  ccRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priceBtn: {
    backgroundColor: 'rgba(28,28,30,0.94)',
    width: 42, height: 42,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,159,10,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45, shadowRadius: 8, elevation: 8,
  },
  priceBtnText: { color: '#FF9F0A', fontSize: 18, fontWeight: '800' },
  ccButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,30,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  ccButtonDot: { width: 9, height: 9, borderRadius: 5 },
  ccButtonText: { fontSize: 14, fontWeight: '800' },
  ccPanel: {
    backgroundColor: 'rgba(28,28,30,0.96)',
    borderRadius: 14,
    padding: 6,
    marginBottom: 8,
    minWidth: 140,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    gap: 2,
  },
  ccOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  ccOptionDot: { width: 8, height: 8, borderRadius: 4 },
  ccOptionLabel: { color: '#E5E5EA', fontSize: 14, fontWeight: '600', flex: 1 },

  // ── 右下ラジアル ──────────────────────────────────
  rightControls: {
    position: 'absolute',
    right: 14,
    bottom: BOTTOM_BASE,
    alignItems: 'center',
    overflow: 'visible',
  },

  // ── 検索バー（下部、キーボード追従） ──────────────
  searchRow: {
    position: 'absolute',
    left: 12,
    right: 80,  // 右コントロールの分だけ空ける
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

  // ── 料金順ボトムシート ──────────────────────────────
  priceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  priceSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: SCREEN_H * 0.55,
    paddingBottom: 30,
  },
  priceHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  priceHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  priceTitle: { color: '#F2F2F7', fontSize: 16, fontWeight: '700' },
  priceEmpty: { alignItems: 'center', paddingVertical: 32 },
  priceEmptyText: { color: '#636366', fontSize: 14 },
  priceItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  priceDot: { width: 10, height: 10, borderRadius: 5 },
  priceInfo: { flex: 1 },
  priceName: { color: '#F2F2F7', fontSize: 14, fontWeight: '600' },
  priceSub: { color: '#8E8E93', fontSize: 12, marginTop: 1 },
  priceDist: { color: '#636366', fontSize: 13, fontWeight: '600' },

  // ── レポートフォームモーダル ────────────────────────
  modalSafe: { flex: 1, backgroundColor: '#000' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalCancel: { color: SYS_BLUE, fontSize: 15 },
  modalTitle: { color: '#F2F2F7', fontSize: 16, fontWeight: '700' },
  formContent: { padding: Spacing.lg, gap: 4 },
  formMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  formMeta: { color: SYS_GRAY, fontSize: 12 },
  formLabel: { color: SYS_GRAY, fontSize: 13, marginTop: 12 },
  formInput: {
    backgroundColor: '#1C1C1E', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#F2F2F7', fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 4,
  },
  formOptionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  formChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  formChipActive: { backgroundColor: SYS_BLUE, borderColor: SYS_BLUE },
  formChipText: { color: SYS_GRAY, fontSize: 13 },
  formChipTextActive: { color: '#fff', fontWeight: '700' },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,132,255,0.3)',
    backgroundColor: 'rgba(10,132,255,0.08)',
  },
  photoBtnText: { color: SYS_BLUE, fontSize: 15, fontWeight: '600' },
  photoPreview: { marginTop: 8, position: 'relative' },
  photoThumb: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#1C1C1E' },
  photoRemove: { position: 'absolute', top: 8, right: 8 },
  formSubmit: {
    marginTop: 24, backgroundColor: SYS_BLUE, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  formSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

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
