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
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, UserCC } from '../types';
import { filterByCC } from '../data/adachi-parking';
import { Spacing } from '../constants/theme';
import { fetchSpotsInRegion, addUserSpotToFirestore } from '../firebase/firestoreService';
import { insertUserSpot } from '../db/database';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { SpotDetailSheet } from '../components/SpotDetailSheet';
import { RadialMenu } from '../components/RadialMenu';

const TOKYO_CENTER: Region = {
  latitude: 35.6895,
  longitude: 139.6917,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const SYS_BLUE = '#0A84FF';
const SYS_GRAY = '#636366';

function markerColor(spot: ParkingPin): string {
  if (spot.source === 'user') return '#BF5AF2';
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

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 44, height: 44 }}>
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
    </View>
  );
}

/** App.tsx から ref 経由で呼び出せるメソッド */
export interface MapScreenHandle {
  resetView: () => void;
}

interface Props {
  userCC: UserCC;
  onOpenMyBike: () => void;
  onChangeCC?: (cc: UserCC) => void;
  focusSpot?: ParkingPin | null;
  onFocusConsumed?: () => void;
  refreshTrigger?: number;
}

export const MapScreen = forwardRef<MapScreenHandle, Props>(function MapScreen(
  { userCC, onOpenMyBike, onChangeCC, focusSpot, onFocusConsumed, refreshTrigger },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const [allSpotsRaw, setAllSpotsRaw]     = useState<ParkingPin[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
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
      console.warn('[MapScreen] fetchSpotsInRegion error:', e);
    }
    setLoading(false);
    lastFetchRegionRef.current = region;
    return fetched;
  }, []);

  // refreshTrigger 変化時（新規スポット登録後など）は現在の可視範囲で再取得
  // 初回 (refreshTrigger=0) は無視（初回フェッチは位置情報取得後に行う）
  const prevTrigger = useRef(refreshTrigger);
  useEffect(() => {
    if (prevTrigger.current !== refreshTrigger && lastFetchRegionRef.current) {
      prevTrigger.current = refreshTrigger;
      fetchSpotsForRegion(lastFetchRegionRef.current);
    }
  }, [refreshTrigger]);

  // 初回: 位置情報取得 → そのエリアのスポットを取得
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
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
      } else {
        // 位置情報なし → 東京中心でフェッチ
        fetchSpotsForRegion(TOKYO_CENTER);
      }
    })();
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
          .catch(() => {});
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
    if (!locationGranted) return;
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
    if (!locationGranted) {
      Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
      return;
    }
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
  const currentRegionRef = useRef<Region>(TOKYO_CENTER);

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
  const handleQuickReport = async () => {
    if (!locationGranted) {
      Alert.alert('位置情報が必要です', '設定から位置情報を許可してください。');
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      // 逆ジオコーディングで住所取得
      let address = '';
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) address = [geo.region, geo.city, geo.street, geo.streetNumber].filter(Boolean).join(' ');
      } catch {}
      const name = address ? `${address} 付近` : '新規スポット（仮）';
      // ローカルDB + Firestore に即登録
      const localId = await insertUserSpot({
        name,
        latitude,
        longitude,
        address: address || undefined,
        maxCC: null, // 制限なし
        isFree: true,
      });
      addUserSpotToFirestore(localId, {
        name,
        latitude,
        longitude,
        address: address || undefined,
        maxCC: null,
        isFree: true,
      }).catch(() => {});
      // マップに即反映
      const newPin: ParkingPin = {
        id: `user_${localId}`,
        name,
        latitude,
        longitude,
        maxCC: null,
        isFree: true,
        capacity: null,
        source: 'user',
        address,
        updatedAt: new Date().toISOString(),
      };
      setAllSpotsRaw((prev) => [...prev, newPin]);
      // カメラをその場所に移動
      mapRef.current?.animateToRegion({
        latitude, longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      }, 600);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSearchResultMsg('スポットを登録しました!');
      setTimeout(() => setSearchResultMsg(null), 3000);
    } catch {
      Alert.alert('エラー', '位置情報の取得に失敗しました。');
    }
  };

  const allSpots = filterByCC(allSpotsRaw, userCC);

  // ── CC チップ ──────────────────────────────────────
  const CC_CYCLE: UserCC[] = [50, 125, 400, null];
  const CC_LABELS: Record<string, { label: string; color: string }> = {
    '50':   { label: '50cc',  color: '#8E8E93' },
    '125':  { label: '125cc', color: '#30D158' },
    '400':  { label: '400cc', color: '#0A84FF' },
    'null': { label: '大型',   color: '#FF9F0A' },
  };
  const ccMeta = CC_LABELS[String(userCC)];
  const cycleCC = () => {
    const idx = CC_CYCLE.indexOf(userCC);
    const next = CC_CYCLE[(idx + 1) % CC_CYCLE.length];
    if (onChangeCC) onChangeCC(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      <ClusteredMapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={TOKYO_CENTER}
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

      {/* ── 右下コントロール（CC + ラジアル）──────────── */}
      {!searchFocused && (
        <View style={styles.rightControls} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.ccChip, { borderColor: `${ccMeta.color}66` }]}
            onPress={cycleCC}
            activeOpacity={0.7}
          >
            <View style={[styles.ccDot, { backgroundColor: ccMeta.color }]} />
            <Text style={[styles.ccChipText, { color: ccMeta.color }]}>{ccMeta.label}</Text>
          </TouchableOpacity>
          <RadialMenu
            onGoToNearest={goToNearestSpot}
            onGoToCurrentLocation={goToCurrentLocation}
            onResearchArea={handleResearch}
            onQuickReport={handleQuickReport}
            onOpenSearch={() => {
              setSearchVisible(true);
              setSearchText('');
              // 次フレームでフォーカス
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

  // ── 右下コントロール（CC + ラジアル 縦積み） ──────
  rightControls: {
    position: 'absolute',
    right: 14,
    bottom: BOTTOM_BASE,
    alignItems: 'center',
    gap: 10,
  },
  ccChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(28,28,30,0.94)',
    width: 56,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  ccDot: { width: 7, height: 7, borderRadius: 4 },
  ccChipText: { fontSize: 10, fontWeight: '800', letterSpacing: -0.3 },

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
});
