import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, UserCC } from '../types';
import { filterByCC } from '../data/adachi-parking';
import { Spacing } from '../constants/theme';
import { fetchAllSpots } from '../firebase/firestoreService';
import { SpotDetailSheet } from '../components/SpotDetailSheet';

const TOKYO_CENTER: Region = {
  latitude: 35.6895,
  longitude: 139.6917,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const CC_SEGMENTS: { value: UserCC; label: string }[] = [
  { value: 50,   label: '50cc'  },
  { value: 125,  label: '125cc' },
  { value: 400,  label: '400cc' },
  { value: null, label: '大型'  },
];

const SYS_BLUE = '#0A84FF';
const SYS_GRAY = '#636366';
const FAB_BG   = 'rgba(44,44,46,0.92)';
const SEG_BG   = 'rgba(44,44,46,0.90)';
const SEG_ACT  = 'rgba(255,255,255,0.16)';

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

interface Props {
  userCC: UserCC;
  onOpenMyBike: () => void;
  onChangeCC?: (cc: UserCC) => void;
  focusSpot?: ParkingPin | null;
  onFocusConsumed?: () => void;
}

export function MapScreen({ userCC, onOpenMyBike, onChangeCC, focusSpot, onFocusConsumed }: Props) {
  const mapRef = useRef<MapView>(null);
  const [allSpotsRaw, setAllSpotsRaw]     = useState<ParkingPin[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState<ParkingPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);

  // Firestore から全スポット取得（初回のみ）
  useEffect(() => {
    fetchAllSpots()
      .then((spots) => setAllSpotsRaw(spots))
      .catch((e) => console.warn('[MapScreen] fetchAllSpots error:', e))
      .finally(() => setLoading(false));
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

  // お気に入りからのジャンプ（タイマーキャンセルバグ修正済み）
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

  const handleSegment = (value: UserCC) => {
    if (onChangeCC) onChangeCC(value);
    else onOpenMyBike();
  };

  const allSpots = filterByCC(allSpotsRaw, userCC);

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
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={TOKYO_CENTER}
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

      {/* セグメントコントロール */}
      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.segmentedWrapper}>
          <View style={styles.segmentedControl}>
            {CC_SEGMENTS.map((seg) => {
              const isActive = userCC === seg.value;
              return (
                <TouchableOpacity
                  key={String(seg.value)}
                  style={[styles.segment, isActive && styles.segmentActive]}
                  onPress={() => handleSegment(seg.value)}
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

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={goToNearestSpot} activeOpacity={0.8}>
          <Ionicons name="locate" size={22} color={SYS_BLUE} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={goToCurrentLocation} activeOpacity={0.8}>
          <Ionicons name="navigate" size={20} color={SYS_BLUE} />
        </TouchableOpacity>
      </View>

      {/* 詳細シート */}
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
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingTop: Spacing.sm,
    gap: 4,
  },
  segmentedWrapper: { alignItems: 'center', gap: 4 },
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
  segment:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  segmentActive:   { backgroundColor: SEG_ACT },
  segmentText:     { color: SYS_GRAY, fontSize: 13, fontWeight: '500' },
  segmentTextActive: { color: '#FFF', fontWeight: '600' },
  spotCount:       { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  fabContainer:    { position: 'absolute', right: Spacing.md, bottom: 100, gap: Spacing.sm },
  fab: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: FAB_BG,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 6,
  },
  pin: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 3, elevation: 4,
  },
  pinText: { fontSize: 13, color: '#fff', fontWeight: '700' },
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
