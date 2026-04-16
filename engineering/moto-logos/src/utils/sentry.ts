/**
 * Sentry 初期化 — Moto-Logos
 *
 * クラッシュレポート・パフォーマンスモニタリングを提供する。
 * Firebase Crashlytics は Expo managed workflow 非対応のため、
 * Expo 公式対応の Sentry を採用。
 *
 * β期間中は Firestore beta_errors コレクションにも書き込み、
 * Slack Bot が検知して即時通知する。
 *
 * 設定手順:
 *   1. https://sentry.io でプロジェクト「moto-logos」を作成
 *   2. .env に EXPO_PUBLIC_SENTRY_DSN を追加
 *   3. app.json の @sentry/react-native プラグインで organization を設定
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

// ── β自動エラー通知 ─────────────────────────────────────
let _betaUserId = '';
const _recentErrors = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

/** UserContext から呼ばれ、エラー報告に userId を含める */
export function setBetaUser(userId: string): void {
  _betaUserId = userId;
}

/** Firestore beta_errors に書き込み（fire-and-forget） */
function _writeBetaError(error: unknown, context?: Record<string, string>): void {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const key = message.slice(0, 200);

    // レート制限: 同一エラー60秒以内はスキップ
    const now = Date.now();
    const last = _recentErrors.get(key);
    if (last && now - last < RATE_LIMIT_MS) return;

    // 古いエントリを掃除
    for (const [k, t] of _recentErrors) {
      if (now - t > RATE_LIMIT_MS) _recentErrors.delete(k);
    }
    _recentErrors.set(key, now);

    // auth 未準備ならスキップ（起動直後のエラー等）
    const { getFirebaseAuth } = require('../firebase/config');
    const auth = getFirebaseAuth();
    if (!auth.currentUser) return;

    // Firestore に書き込み
    const { addDoc, collection, Timestamp } = require('firebase/firestore');
    const { db } = require('../firebase/config');

    addDoc(collection(db, 'beta_errors'), {
      message,
      stack: error instanceof Error ? (error.stack ?? '') : '',
      context: context ?? null,
      os: Platform.OS,
      deviceModel: Device.modelName ?? 'unknown',
      deviceBrand: Device.brand ?? 'unknown',
      osVersion: Device.osVersion ?? 'unknown',
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      userId: _betaUserId || 'unknown',
      createdAt: Timestamp.now(),
    }).catch(() => {}); // 書き込み失敗は無視（再帰防止）
  } catch {
    // _writeBetaError 自体の失敗は絶対に外に漏らさない
  }
}

/**
 * Sentry を初期化する。
 * DSN が未設定の場合はサイレントに何もしない（開発時の安全策）。
 */
export function initSentry(): void {
  if (!DSN) {
    console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN が未設定のため初期化をスキップしました');
    if (!__DEV__) {
      console.warn('[Sentry] 本番環境で DSN 未設定です。エラーは console.error にフォールバックします');
    }
    return;
  }

  Sentry.init({
    dsn: DSN,

    // 開発時はデバッグログを有効にする
    debug: __DEV__,

    // 本番のみトレーシングを有効化（パフォーマンス計測）
    tracesSampleRate: __DEV__ ? 0 : 0.2,

    // リリース情報を自動タグ付け
    release: Constants.expoConfig?.version
      ? `moto-logos@${Constants.expoConfig.version}`
      : undefined,

    // 環境を自動判定
    environment: __DEV__ ? 'development' : 'production',

    // EAS Update のチャネル情報をタグに含める
    ...(Constants.expoConfig?.extra?.eas?.projectId && {
      dist: Constants.expoConfig.extra.eas.projectId,
    }),
  });
}

/**
 * 手動でエラーを Sentry に送信する。
 * try-catch で捕捉したエラーの報告に使う。
 * β期間中は Firestore にも書き込み、Slack 通知をトリガーする。
 */
export function captureError(error: unknown, context?: Record<string, string>): void {
  // Firestore β自動通知（Sentry の有無に関係なく実行）
  _writeBetaError(error, context);

  if (!DSN) {
    // DSN 未設定時は console.error にフォールバック
    console.error('[Sentry fallback]', error, context);
    return;
  }

  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Sentry にユーザー識別情報をセットする。
 * ニックネーム設定時に呼び出す。
 */
export function setSentryUser(nickname: string): void {
  if (!DSN) return;
  Sentry.setUser({ username: nickname });
}

/**
 * Sentry の wrap 関数をエクスポート。
 * ルートコンポーネントをラップして自動的にクラッシュを捕捉する。
 */
export const sentryWrap = Sentry.wrap;
