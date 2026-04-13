/**
 * useProximityState — 現在地ベースの近接状態判定フック
 *
 * 現在地と読み込み済みスポットの距離を監視し、3つの状態を返す:
 *   nearby   — 最寄りスポット ≤ 50m（「停められた/ダメだった」カード表示）
 *   no-spots — 表示圏内にスポット 0 件（「登録する/他を探す」カード表示）
 *   normal   — 上記以外（カード非表示）
 *
 * クールダウン: 同一スポットへの報告から 24h 以内は nearby を抑制
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { ParkingPin } from '../types';

// ── 定数 ──────────────────────────────────────────────
const NEARBY_THRESHOLD_M = 50;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const LOCATION_INTERVAL_MS = 5_000; // GPS ポーリング間隔
const LOCATION_DISTANCE_M = 10; // 最小移動距離

// ── haversine（MapScreen.tsx と同一ロジック） ─────────
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

// ── 型定義 ─────────────────────────────────────────────
export interface NearbySpotInfo {
  spot: ParkingPin;
  distanceM: number;
}

export type ProximityState =
  | { kind: 'nearby'; nearest: NearbySpotInfo }
  | { kind: 'no-spots' }
  | { kind: 'normal' };

interface UseProximityStateOpts {
  spots: ParkingPin[];
  enabled: boolean; // SpotDetailSheet 表示中は false
}

// ── クールダウン管理 ──────────────────────────────────
async function isCoolingDown(spotId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(`lastReport_${spotId}`);
  if (!raw) return false;
  return Date.now() - parseInt(raw, 10) < COOLDOWN_MS;
}

export async function markReported(spotId: string): Promise<void> {
  await AsyncStorage.setItem(`lastReport_${spotId}`, String(Date.now()));
}

// ── フック本体 ─────────────────────────────────────────
export function useProximityState({ spots, enabled }: UseProximityStateOpts) {
  const [state, setState] = useState<ProximityState>({ kind: 'normal' });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  // GPS 監視開始/停止
  useEffect(() => {
    if (!enabled) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      setState({ kind: 'normal' });
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LOCATION_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_M,
        },
        (loc) => {
          if (!cancelled) {
            setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        },
      );
      if (cancelled) {
        sub.remove();
      } else {
        subscriptionRef.current = sub;
      }
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [enabled]);

  // 状態判定（位置 or スポット一覧が変わるたびに再計算）
  useEffect(() => {
    if (!enabled || !userLocation || spots.length === 0) {
      if (enabled && userLocation && spots.length === 0) {
        setState({ kind: 'no-spots' });
      } else if (!enabled) {
        setState({ kind: 'normal' });
      }
      return;
    }

    let cancelled = false;

    (async () => {
      // 距離付きでソート
      const withDist = spots.map((spot) => ({
        spot,
        distanceM: haversineMeters(
          userLocation.latitude,
          userLocation.longitude,
          spot.latitude,
          spot.longitude,
        ),
      }));
      withDist.sort((a, b) => a.distanceM - b.distanceM);

      const nearest = withDist[0];
      if (!nearest || cancelled) return;

      if (nearest.distanceM <= NEARBY_THRESHOLD_M) {
        // クールダウンチェック
        const cooling = await isCoolingDown(nearest.spot.id);
        if (cancelled) return;
        if (cooling) {
          setState({ kind: 'normal' });
        } else {
          setState({ kind: 'nearby', nearest });
        }
      } else {
        setState({ kind: 'normal' });
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, userLocation, spots]);

  // 「他を探す」用: 現在地から近い順に最大5件（指定 spotId を除外可能）
  const getNearbyAlternatives = useCallback(
    (excludeSpotId?: string, maxCount = 5): NearbySpotInfo[] => {
      if (!userLocation) return [];
      return spots
        .filter((s) => s.id !== excludeSpotId)
        .map((s) => ({
          spot: s,
          distanceM: haversineMeters(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude),
        }))
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, maxCount);
    },
    [userLocation, spots],
  );

  return { state, userLocation, getNearbyAlternatives };
}
