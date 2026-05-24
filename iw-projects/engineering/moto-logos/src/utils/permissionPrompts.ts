/**
 * 権限要求プロンプトの状態管理
 *
 * システムの権限ダイアログを出す前にカスタムカード（PrePermissionDialog）を挟むため、
 * 「もう案内したか」を AsyncStorage で記録して二重表示を防ぐ。
 *
 * フロー:
 *   1. shouldShowXxxPrompt() で「未案内 + 未許可」を判定
 *   2. PrePermissionDialog を表示
 *   3. 「許可する」→ 実際の権限要求 + markXxxPromptShown()
 *   4. 「あとで」→ markXxxPromptShown() のみ（次回以降は出さない）
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as Device from 'expo-device';

const NOTIF_PROMPT_KEY = 'moto_logos_notif_prompt_shown';
const LOC_PROMPT_KEY = 'moto_logos_loc_prompt_shown';

// ── 通知 ──────────────────────────────────────────────

export async function shouldShowNotificationPrompt(): Promise<boolean> {
  if (!Device.isDevice) return false; // シミュレータでは通知不可
  try {
    const shown = await AsyncStorage.getItem(NOTIF_PROMPT_KEY);
    if (shown === 'true') return false;
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'undetermined';
  } catch {
    return false;
  }
}

export async function markNotificationPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_PROMPT_KEY, 'true');
  } catch { /* noop */ }
}

// ── 位置情報 ──────────────────────────────────────────

export async function shouldShowLocationPrompt(): Promise<boolean> {
  try {
    const shown = await AsyncStorage.getItem(LOC_PROMPT_KEY);
    if (shown === 'true') return false;
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'undetermined';
  } catch {
    return false;
  }
}

export async function markLocationPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(LOC_PROMPT_KEY, 'true');
  } catch { /* noop */ }
}

// ── バックグラウンド位置情報（ジオフェンス用） ─────────

const BG_LOC_PROMPT_KEY = 'moto_logos_bg_loc_prompt_shown';

export async function shouldShowBackgroundLocationPrompt(): Promise<boolean> {
  try {
    const shown = await AsyncStorage.getItem(BG_LOC_PROMPT_KEY);
    if (shown === 'true') return false;
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status !== 'granted';
  } catch {
    return false;
  }
}

export async function markBackgroundLocationPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(BG_LOC_PROMPT_KEY, 'true');
  } catch { /* noop */ }
}

// ── テスト用リセット（開発時のみ） ─────────────────────

export async function resetPermissionPrompts(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([NOTIF_PROMPT_KEY, LOC_PROMPT_KEY, BG_LOC_PROMPT_KEY]);
  } catch { /* noop */ }
}
