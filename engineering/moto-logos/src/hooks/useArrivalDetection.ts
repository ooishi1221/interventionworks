/**
 * useArrivalDetection — 「ここ行く」スポットへの到着を検知し、ローカル通知を出す
 *
 * フロー:
 *   1. setDestination() でスポットを登録 → AsyncStorage に保存
 *   2. GPS監視（フォアグラウンド/バックグラウンド）で50m以内を検知
 *   3. ローカル通知を出し分け:
 *      - 写真付きレビューなし →「📸 ○○の看板、メモしとく？」
 *      - 写真付きレビューあり →「○○駐車場、停められた？」
 *   4. 通知タップ → アプリがフォアグラウンドに → ProximityContextCardが発動
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ParkingPin } from '../types';
import { fetchReviews, reportParked, reportDeparted } from '../firebase/firestoreService';
import { addFootprint, startParking, getFirstVehicle, expireOldParkingSessions } from '../db/database';
import { captureError } from '../utils/sentry';
import { haversineMeters } from '../utils/distance';

const STORAGE_KEY = 'moto_logos_destination';
const ARRIVAL_THRESHOLD_M = 50;
const CHECK_INTERVAL_MS = 10_000; // 10秒
const CHECK_DISTANCE_M = 15;     // 15m移動で再チェック

export interface Destination {
  spot: ParkingPin;
  setAt: number; // timestamp
}

export function useArrivalDetection() {
  const [destination, setDestinationState] = useState<Destination | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const arrivedRef = useRef(false);

  // 起動時に保存済みの行き先を復元
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const dest: Destination = JSON.parse(raw);
        // 24時間以上前の行き先は無視
        if (Date.now() - dest.setAt > 24 * 60 * 60 * 1000) {
          await AsyncStorage.removeItem(STORAGE_KEY);
          return;
        }
        setDestinationState(dest);
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    })();
  }, []);

  // 行き先を設定
  const setDestination = useCallback(async (spot: ParkingPin) => {
    const dest: Destination = { spot, setAt: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dest));
    setDestinationState(dest);
    arrivedRef.current = false;
  }, []);

  // 行き先をクリア
  const clearDestination = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setDestinationState(null);
    arrivedRef.current = false;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  }, []);

  // GPS監視 → 到着検知 → ローカル通知
  useEffect(() => {
    if (!destination) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: CHECK_INTERVAL_MS,
          distanceInterval: CHECK_DISTANCE_M,
        },
        async (loc) => {
          if (cancelled || arrivedRef.current) return;

          const dist = haversineMeters(
            loc.coords.latitude,
            loc.coords.longitude,
            destination.spot.latitude,
            destination.spot.longitude,
          );

          if (dist <= ARRIVAL_THRESHOLD_M) {
            arrivedRef.current = true;
            const spot = destination.spot;

            // ── 古いセッションを自動終了してから新規開始 (#110) ──
            expireOldParkingSessions(2 * 60 * 60 * 1000).then((expired) => {
              for (const s of expired) reportDeparted(s.spotId).catch((e) => captureError(e, { context: 'auto_expire_departed', spotId: s.spotId }));
            }).catch((e) => captureError(e, { context: 'expire_old_sessions' }));

            // ── 自動で温度UP + 足跡記録（ボタン不要）──
            reportParked(spot.id).catch((e) => captureError(e, { context: 'auto_report_parked' }));
            addFootprint(spot.id, spot.name, spot.latitude, spot.longitude, 'parked')
              .catch((e) => captureError(e, { context: 'auto_footprint' }));
            getFirstVehicle().then((bike) =>
              startParking(spot.id, spot.name, spot.latitude, spot.longitude, bike?.id)
            ).catch((e) => captureError(e, { context: 'auto_parking_session' }));

            await sendArrivalNotification(spot);
            // 到着したら行き先をクリア
            await AsyncStorage.removeItem(STORAGE_KEY);
            setDestinationState(null);
            sub.remove();
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
  }, [destination]);

  return { destination, setDestination, clearDestination };
}

/**
 * 到着時のローカル通知を送信。
 * 到着=停めたで自動記録済み。通知は「看板メモ」の促しのみ。
 */
async function sendArrivalNotification(spot: ParkingPin): Promise<void> {
  try {
    // 看板写真があるかチェック → あれば軽い通知、なければ写真を促す
    let hasPhoto = false;
    try {
      const reviews = await fetchReviews(spot.id);
      hasPhoto = reviews.some((r) => r.photoUri);
    } catch (e) {
      captureError(e, { context: 'fetch_reviews_for_notification', spotId: spot.id });
    }

    const title = hasPhoto
      ? `${spot.name}に到着`
      : `📸 ${spot.name}の看板、メモしとく？`;

    const body = hasPhoto
      ? '足跡が刻まれました'
      : '次のライダーの道しるべになります';

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: { type: 'arrival', spotId: spot.id },
      },
      trigger: null,
    });
  } catch (e) {
    captureError(e, { context: 'arrival_notification' });
  }
}
