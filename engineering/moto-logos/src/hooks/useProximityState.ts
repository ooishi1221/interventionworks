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
import { haversineMeters } from '../utils/distance';

// ── 定数 ──────────────────────────────────────────────
const NEARBY_THRESHOLD_M = 50;
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h（自動出発と同期）
const LOCATION_INTERVAL_MS = 15_000; // GPS ポーリング間隔
const LOCATION_DISTANCE_M = 30; // 最小移動距離

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
  loading?: boolean; // スポット読み込み中は no-spots を抑制
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
export function useProximityState({ spots, enabled, loading }: UseProximityStateOpts) {
  const [state, setState] = useState<ProximityState>({ kind: 'normal' });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastCalcLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const cooldownCacheRef = useRef<Map<string, { result: boolean; at: number }>>(new Map());
  // state更新済み位置を保持し、小移動での無駄な再レンダーを防ぐ
  const lastStatePosRef = useRef<{ latitude: number; longitude: number } | null>(null);

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
          if (cancelled) return;
          const newPos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          // 50m未満の移動はstate更新をスキップ → 再レンダー抑制
          const prev = lastStatePosRef.current;
          if (prev && haversineMeters(prev.latitude, prev.longitude, newPos.latitude, newPos.longitude) < 50) {
            return;
          }
          lastStatePosRef.current = newPos;
          setUserLocation(newPos);
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
  // 100m以上動いた場合のみフル再計算してCPU節約
  useEffect(() => {
    if (!enabled || !userLocation || spots.length === 0) {
      if (enabled && userLocation && spots.length === 0 && !loading) {
        setState({ kind: 'no-spots' });
      } else if (!enabled) {
        setState({ kind: 'normal' });
      }
      return;
    }

    // 100m以上動いていなければスキップ（スポット変更時は常に再計算）
    const prev = lastCalcLocationRef.current;
    if (prev) {
      const moved = haversineMeters(prev.latitude, prev.longitude, userLocation.latitude, userLocation.longitude);
      if (moved < 100) return;
    }
    lastCalcLocationRef.current = userLocation;

    let cancelled = false;

    (async () => {
      // 最寄りだけ探す（全ソート不要）
      let nearestSpot: ParkingPin | null = null;
      let nearestDist = Infinity;
      for (const spot of spots) {
        const d = haversineMeters(userLocation.latitude, userLocation.longitude, spot.latitude, spot.longitude);
        if (d < nearestDist) { nearestDist = d; nearestSpot = spot; }
      }

      if (!nearestSpot || cancelled) return;

      if (nearestDist <= NEARBY_THRESHOLD_M) {
        // クールダウンチェック（キャッシュ付き、60秒有効、1時間TTLで自動evict）
        const now = Date.now();
        const cached = cooldownCacheRef.current.get(nearestSpot.id);
        let cooling: boolean;
        if (cached && now - cached.at < 60_000) {
          cooling = cached.result;
        } else {
          cooling = await isCoolingDown(nearestSpot.id);
          if (cancelled) return;
          cooldownCacheRef.current.set(nearestSpot.id, { result: cooling, at: now });
          // 1時間超の古いエントリを掃除（キャッシュ肥大化防止）
          if (cooldownCacheRef.current.size > 50) {
            for (const [key, val] of cooldownCacheRef.current) {
              if (now - val.at > 3_600_000) cooldownCacheRef.current.delete(key);
            }
          }
        }
        if (cooling) {
          setState({ kind: 'normal' });
        } else {
          setState({ kind: 'nearby', nearest: { spot: nearestSpot, distanceM: nearestDist } });
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
