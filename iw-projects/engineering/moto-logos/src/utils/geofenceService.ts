import * as Location from 'expo-location';
import { setNavigationTarget, clearNavigationTarget, getNavigationTarget } from './navigationState';

export const GEOFENCE_TASK_NAME = 'GEOFENCE_ARRIVAL';
const GEOFENCE_RADIUS_M = 500;

/**
 * 案内先スポットの 500m 圏にジオフェンスを登録する。
 * Background location permission が無ければ要求し、拒否時は silent fail。
 */
export async function registerArrivalGeofence(spot: {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  // ナビゲーションターゲットを即座に永続化（バナー表示 + バックグラウンドタスクから参照）
  // パーミッションチェックの前に保存する。Google マップが開いてアプリがバックグラウンドに
  // 行くと、パーミッションダイアログが出せず Promise が宙に浮くため。
  await setNavigationTarget(spot);

  // Foreground permission が無ければ先に取る
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    const req = await Location.requestForegroundPermissionsAsync();
    if (req.status !== 'granted') return; // silent fail
  }

  // Background permission を要求（ジオフェンスに必須）
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    const req = await Location.requestBackgroundPermissionsAsync();
    if (req.status !== 'granted') return; // silent fail — ナビは動く、通知だけ来ない
  }

  // 既存のジオフェンスを停止（同名タスクの上書き）
  try {
    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch { /* ignore */ }

  // ジオフェンス登録
  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
    {
      latitude: spot.latitude,
      longitude: spot.longitude,
      radius: GEOFENCE_RADIUS_M,
      notifyOnEnter: true,
      notifyOnExit: false,
    },
  ]);
}

/**
 * ジオフェンスを停止し、ナビゲーションターゲットをクリアする。
 */
export async function cleanupGeofence(): Promise<void> {
  try {
    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch { /* ignore */ }
  await clearNavigationTarget();
}

/**
 * 24h 以上経過した古いジオフェンスをクリーンアップ。アプリ起動時に呼ぶ。
 */
export async function checkAndCleanupStaleGeofence(): Promise<void> {
  const target = await getNavigationTarget();
  // getNavigationTarget() は 24h 超で null を返す（内部で自動削除）
  if (!target) {
    try {
      const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
      if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    } catch { /* ignore */ }
  }
}
