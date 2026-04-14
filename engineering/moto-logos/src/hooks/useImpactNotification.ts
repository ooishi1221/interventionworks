/**
 * useImpactNotification — 「あなたの足跡で○人が助かりました」通知（デジタルヤエー）
 *
 * フロー:
 *   1. アプリがフォアグラウンドに来るたびに、自分が登録したスポットの合計閲覧数を取得
 *   2. AsyncStorage に前回通知時の閲覧数を保存
 *   3. 前回通知時から +5 以上増えていたら、ローカル通知を発火
 *   4. 1日1回までのスロットル制限
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getMySpotsTotalViews } from '../firebase/firestoreService';
import { getAllUserSpots } from '../db/database';
import { captureError } from '../utils/sentry';

const LAST_VIEWS_KEY = 'moto_logos_impact_last_views';
const LAST_NOTIFIED_KEY = 'moto_logos_impact_last_notified';
const VIEW_THRESHOLD = 5;            // 通知を出す最小増分
const THROTTLE_MS = 24 * 60 * 60 * 1000; // 1日1回まで

/**
 * アプリフォアグラウンド復帰時に閲覧数をチェックし、
 * 増加があればローカル通知でライダーに伝える。
 */
export function useImpactNotification(): void {
  const checkingRef = useRef(false);

  useEffect(() => {
    const checkImpact = async () => {
      // 二重実行を防止
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        // スロットル: 前回通知から24h以内ならスキップ
        const lastNotified = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
        if (lastNotified && Date.now() - Number(lastNotified) < THROTTLE_MS) {
          return;
        }

        // ユーザーが登録したスポットのIDリストを取得
        const spots = await getAllUserSpots();
        if (spots.length === 0) return;

        const spotIds = spots.map((s) => `user_${s.id}`);
        const currentViews = await getMySpotsTotalViews(spotIds);

        // 前回通知時の閲覧数を取得
        const lastViewsRaw = await AsyncStorage.getItem(LAST_VIEWS_KEY);
        const lastViews = lastViewsRaw ? Number(lastViewsRaw) : 0;

        // 初回: ベースラインを保存して終了（いきなり通知しない）
        if (!lastViewsRaw) {
          await AsyncStorage.setItem(LAST_VIEWS_KEY, String(currentViews));
          return;
        }

        const delta = currentViews - lastViews;

        if (delta >= VIEW_THRESHOLD) {
          // ローカル通知を発火
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `あなたの足跡で${currentViews}人が助かりました 🤝`,
              body: '走り続けるあなたの存在が、仲間の道しるべになっています',
              sound: 'default',
              data: { type: 'impact' },
            },
            trigger: null, // 即時送信
          });

          // ベースラインと通知時刻を更新
          await AsyncStorage.setItem(LAST_VIEWS_KEY, String(currentViews));
          await AsyncStorage.setItem(LAST_NOTIFIED_KEY, String(Date.now()));
        }
      } catch (e) {
        captureError(e, { context: 'impact_notification' });
      } finally {
        checkingRef.current = false;
      }
    };

    // アプリ起動時にもチェック
    checkImpact();

    // AppState 変化（バックグラウンド → フォアグラウンド）でチェック
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkImpact();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);
}
