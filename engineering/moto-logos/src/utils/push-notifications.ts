/**
 * Push Notifications -- Moto-Logos
 *
 * Expo Push Notifications を利用して、管理者からユーザーへの
 * 個別通知（BAN通知、申立結果、お知らせ等）を受信する。
 *
 * - 物理デバイスでのみトークンを取得（シミュレータは非対応）
 * - トークンは Firestore `push_tokens` コレクションにデバイスID で保存
 * - フォアグラウンド受信時もバナー表示する設定を含む
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../firebase/firestoreTypes';

const DEVICE_ID_KEY = 'moto_logos_device_id';

/**
 * フォアグラウンドで通知を受信したときの表示設定。
 * アラート・バッジ・サウンドすべて表示する。
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Expo Push Token を取得し、Firestore に保存する。
 *
 * - 物理デバイスでなければスキップ
 * - パーミッション未許可ならリクエスト、拒否されたらスキップ
 * - Android は通知チャンネル設定が必要
 *
 * @returns 取得した Expo Push Token 文字列、または取得できなかった場合 null
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // シミュレータ / エミュレータではプッシュ通知は動作しない
  if (!Device.isDevice) {
    console.log('[PushNotifications] 物理デバイスではないためスキップ');
    return null;
  }

  // 既存のパーミッション状態を確認
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // 未許可の場合はリクエスト
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[PushNotifications] 通知パーミッションが拒否されました');
    return null;
  }

  // Android は通知チャンネルが必要
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B00',
    });
  }

  try {
    // Expo Push Token を取得
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'e0e8b07d-509a-4db3-9c39-c9360c774a18',
    });
    const token = tokenData.data; // ExponentPushToken[xxx] 形式

    // Firestore にトークンを保存
    await savePushToken(token);

    console.log('[PushNotifications] トークン登録完了:', token);
    return token;
  } catch (error) {
    console.warn('[PushNotifications] トークン取得に失敗:', error);
    return null;
  }
}

/**
 * Expo Push Token を Firestore の push_tokens コレクションに保存する。
 * デバイスID をドキュメントキーとして使い、同一デバイスのトークンを上書きする。
 */
async function savePushToken(token: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    if (!deviceId) {
      console.warn('[PushNotifications] デバイスIDが取得できませんでした');
      return;
    }

    await setDoc(doc(db, COLLECTIONS.PUSH_TOKENS, deviceId), {
      token,
      deviceId,
      platform: Platform.OS,
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    // トークン保存失敗はアプリ動作に影響させない
    console.warn('[PushNotifications] トークン保存に失敗:', error);
  }
}

/**
 * AsyncStorage からデバイスIDを取得する。
 * firestoreService.ts の getDeviceId と同じキーを使う。
 */
async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_ID_KEY);
}
