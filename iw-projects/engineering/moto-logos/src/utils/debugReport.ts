/**
 * デバッグ情報シェア — ユーザーがワンタップで現状を送信
 *
 * Firestore `debug_reports` に書き込み → Slack Bot が onSnapshot で拾い通知。
 * 実機でバグに遭遇したユーザーに「設定 → デバッグ情報を送信」を押してもらえば、
 * uid / ビルド / 端末情報 / 直近の挙動がまとめて開発者の手元に届く。
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, getFirebaseAuth } from '../firebase/config';

const RECENT_ERRORS_KEY = 'moto_logos_recent_errors';
const MAX_RECENT_ERRORS = 5;

export interface RecentError {
  ts: string;
  context: string;
  message: string;
}

/** captureError 内から呼ばれる想定。直近N件のエラーを AsyncStorage に保持 */
export async function pushRecentError(err: RecentError): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ERRORS_KEY);
    const arr: RecentError[] = raw ? JSON.parse(raw) : [];
    arr.unshift(err);
    await AsyncStorage.setItem(
      RECENT_ERRORS_KEY,
      JSON.stringify(arr.slice(0, MAX_RECENT_ERRORS)),
    );
  } catch {
    // 保存失敗は致命的ではない
  }
}

async function getRecentErrors(): Promise<RecentError[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ERRORS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface DebugReportPayload {
  userId: string;
  authUid: string | null;
  platform: string;
  osVersion: string;
  deviceModel: string;
  deviceBrand: string;
  appVersion: string;
  buildNumber: string | number | null;
  updateId: string;
  runtimeVersion: string;
  channel: string;
  recentErrors: RecentError[];
  userNote?: string;
  extra?: Record<string, unknown>;
}

/** 設定画面からワンタップで呼ばれる送信エントリポイント */
export async function sendDebugReport(options?: {
  userNote?: string;
  extra?: Record<string, unknown>;
}): Promise<string> {
  const auth = getFirebaseAuth();
  const payload: DebugReportPayload & { createdAt: ReturnType<typeof serverTimestamp> } = {
    userId: auth.currentUser?.uid ?? 'anonymous',
    authUid: auth.currentUser?.uid ?? null,
    platform: Platform.OS,
    osVersion: Device.osVersion ?? 'unknown',
    deviceModel: Device.modelName ?? 'unknown',
    deviceBrand: Device.brand ?? 'unknown',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildNumber:
      Platform.OS === 'ios'
        ? Constants.expoConfig?.ios?.buildNumber ?? null
        : Constants.expoConfig?.android?.versionCode ?? null,
    updateId: Updates.updateId ?? 'embedded',
    runtimeVersion:
      typeof Updates.runtimeVersion === 'string' ? Updates.runtimeVersion : 'unknown',
    channel: Updates.channel ?? 'unknown',
    recentErrors: await getRecentErrors(),
    userNote: options?.userNote,
    extra: options?.extra,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'debug_reports'), payload);
  return docRef.id;
}
