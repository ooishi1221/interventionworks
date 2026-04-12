/**
 * Sentry 初期化 — Moto-Logos
 *
 * クラッシュレポート・パフォーマンスモニタリングを提供する。
 * Firebase Crashlytics は Expo managed workflow 非対応のため、
 * Expo 公式対応の Sentry を採用。
 *
 * 設定手順:
 *   1. https://sentry.io でプロジェクト「moto-logos」を作成
 *   2. .env に EXPO_PUBLIC_SENTRY_DSN を追加
 *   3. app.json の @sentry/react-native プラグインで organization を設定
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/**
 * Sentry を初期化する。
 * DSN が未設定の場合はサイレントに何もしない（開発時の安全策）。
 */
export function initSentry(): void {
  if (!DSN) {
    if (__DEV__) {
      console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN が未設定のため初期化をスキップしました');
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
 */
export function captureError(error: unknown, context?: Record<string, string>): void {
  if (!DSN) return;

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
