# Moto-Logos（モトロゴス）

## アプリ概要

**正式名称:** Moto-Logos（モトロゴス）  
**略称:** モトロゴ  
**由来:** Moto（バイク） + Logos（言葉・理性・集まり）  
**コンセプト:** 「一人の発見を、全ライダーの安心に。」

ライダーが走りながら見つけた「停められる場所」をリアルタイムで共有し合い、世界で最も信頼できるバイク専用の地図を自分たちの手で育てるプロジェクト。

### コア・バリュー

1. **親指一本の貢献** — グローブをしたまま、0.5秒で「停められた」「閉鎖されてた」を報告。ボタンサイズ最小 52pt、推奨 64pt 以上
2. **情報の鮮度は仲間の絆** — 青バッジ=最近誰かが確認した証。鮮度で色分け（1ヶ月以内=青、3ヶ月=黄、6ヶ月以上=赤）
3. **無限の地図** — データは「種」。走れば走るほどピンが増え、古い情報は更新される

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Expo SDK 54 / React Native 0.81 / React 19 |
| 言語 | TypeScript 5.9（strict mode） |
| クラウドDB | Firebase Firestore（オフライン永続キャッシュ有効）+ Firebase Storage（写真） |
| ローカルDB | expo-sqlite（WAL モード、ユーザーデータ・お気に入り・評価） |
| 地図 | react-native-maps + react-native-map-clustering |
| アニメーション | react-native-reanimated + react-native-gesture-handler |
| 空間検索 | Geohash プレフィクスクエリ（自前実装、外部依存なし） |
| クラッシュ監視 | Sentry `@sentry/react-native ~7.2.0`（org: `moto-logos-team`） |
| ビルド/配信 | EAS Build（development / preview / production）、EAS Update（OTA） |
| 状態管理 | React hooks のみ（外部ライブラリなし） |

---

## アーキテクチャ

### データフロー

```
Firestore（共有）──→ geohash範囲検索 ──→ MapScreen表示
                                          ↕ マージ
SQLite（ローカル）──→ ユーザースポット ──→ Firestore同期
Firebase Storage ──→ レビュー写真（圧縮アップロード → 公開URL）
AsyncStorage ──→ 設定値（deviceId, ニックネーム、チュートリアル済フラグ等）
UserContext ──→ deviceId ベースのユーザー識別 → Firestore users コレクション
```

### オフラインファースト設計

- Firestore の `persistentLocalCache` で一度表示したエリアは通信なしで表示
- SQLite にユーザー操作（お気に入り、評価、マイバイク）を即時保存
- ネットワーク復帰時に Firestore へ自動同期

### フォルダ構成

```
src/
├── screens/        # 画面コンポーネント（MapScreen, RiderScreen 等）
├── components/     # 再利用UI（SpotDetailSheet, RadialMenu, TutorialOverlay）
├── contexts/       # React Context（UserContext — ユーザー識別）
├── firebase/       # Firestore/Storage 初期化・CRUD・型定義
├── db/             # SQLite スキーマ・CRUD
├── hooks/          # カスタムフック（useDatabase）
├── utils/          # ユーティリティ（geohash, image-upload, ng-filter, sentry）
├── constants/      # テーマ・地図スタイル
├── types/          # TypeScript 型定義
└── data/           # シードデータ
scripts/            # Firestore データ投入・マイグレーション用スクリプト
plugins/            # カスタム Expo プラグイン（Yahoo ナビ連携）
```

---

## デザインシステム

### カラーパレット

| 用途 | カラー |
|------|--------|
| 背景 | `#0D0D0D` |
| サーフェス | `#1A1A1A` |
| カード | `#242424` |
| アクセント（オレンジ） | `#FF6B00` |
| テキスト | `#F5F5F5` |
| テキスト（セカンダリ） | `#A0A0A0` |
| ボーダー | `#333333` |
| 成功 | `#4CAF50` |
| 危険 | `#F44336` |

### UI原則

- **ダークモード専用** — ヘルメット越し・夜間走行でも視認性を確保
- **グローブ対応タップ領域** — ボタン最小 52pt、主要アクション 64pt 以上
- **親指一本操作** — 片手持ちで全機能にアクセス可能な配置
- **アイコンセット** — Ionicons + MaterialCommunityIcons

---

## 開発ルール

### コード規約

- TypeScript strict。`any` は原則禁止、やむを得ない場合はコメントで理由を明記
- 関数コンポーネント + hooks のみ（クラスコンポーネント禁止）
- 状態管理は React hooks で完結させる。外部ライブラリ（Redux, Zustand 等）は導入しない
- ファイル名はケバブケース（`spot-detail-sheet.tsx`）、型名はパスカルケース

### ユーザー識別システム

- **デバイスIDベース**: AsyncStorage の `moto_logos_device_id`（UUID v4）を userId として使用
- `UserContext` (`src/contexts/UserContext.tsx`) がアプリ全体に `userId`, `rank`, `trustScore` を供給
- 初回起動時に Firestore `users` コレクションにドキュメントを自動作成（初期 trustScore: 100, rank: rider）
- 将来の Firebase Auth 移行パス確保済み（userId の差し替えのみで移行可能）
- レビュー・投票には必ず実 userId を紐付ける（`'local_user'` ハードコード禁止）

### 写真アップロード（Firebase Storage）

- レビュー写真は Firebase Storage にアップロードし、公開 URL を Firestore `reviews.photoUrls` に保存
- アップロード前に `expo-image-manipulator` で圧縮（max 1024px, JPEG quality 0.7）
- Storage パス: `reviews/{spotId}/{userId}_{timestamp}.jpg`
- アップロード中はプログレスバーを表示
- ローカル URI を直接 Firestore に保存しない

### Firestore 運用

- 新規スポットには必ず `geohash`（精度9）を付与する
- Read 数を意識する。全件取得（`fetchAllSpots`）はマイグレーション期間のみ
- `user_activity` コレクション: アプリ起動時に1日1回デバイスIDと日付を記録（DAU/WAU/MAU 集計用）
- `users` コレクション: デバイスID をキーとしたユーザープロフィール（displayName, trustScore, rank）
- Firestore ルールは Firebase Console で管理（リポジトリ外）

### 環境変数

- `.env` に Firebase + Sentry 設定値を格納（`EXPO_PUBLIC_` プレフィクス必須）
- `.env` は `.gitignore` 済み。新規メンバーは Firebase Console / Sentry から値を取得する
- EAS Build 時は `eas.json` の `env` ブロックから Sentry DSN を注入

### クラッシュ監視（Sentry）

- Sentry（`@sentry/react-native ~7.2.0`）を使用（Expo managed workflow 対応）
- **Organization:** `moto-logos-team` / **Project:** `moto-logos`
- `App.tsx` で `initSentry()` + `sentryWrap()` で自動キャプチャ
- `ErrorBoundary` コンポーネントで React レンダーエラーをキャッチ
- `captureError()` で try-catch 内の手動エラー送信（全 Firestore 操作・レポート送信に適用済み）
- `setSentryUser()` でニックネーム設定時にユーザーコンテキストをセット
- DSN 未設定時はサイレントスキップ（開発時の安全策）
- 本番: `tracesSampleRate: 0.2`（パフォーマンス計測20%サンプリング）

### エラーハンドリング方針

- Firestore 同期失敗時は `Alert` でユーザーに通知 + `captureError()` で Sentry 送信
- 位置情報パーミッション拒否時はオレンジバナー表示 + 設定画面リンク + 東京にフォールバック
- スポット0件時は地図上にオーバーレイ（「このエリアにはまだスポットがありません」）
- `.catch(() => {})` での無言エラー握りつぶしは禁止。最低限 `captureError()` を入れる

### NGワードフィルタ

- `src/utils/ng-filter.ts` でクライアント側フィルタ（即時フィードバック用）
- サーバー側は管理ダッシュボード API で本格的なチェック
- ひらがな/カタカナ正規化対応

### アプリ識別子

| プラットフォーム | 識別子 |
|----------------|--------|
| iOS bundleIdentifier | `com.interventionworks.motologos` |
| Android package | `com.interventionworks.motologos` |

### ビルド・配信（EAS Build）

3プロファイル構成（`eas.json`）:

| プロファイル | 用途 | 配布 | channel |
|------------|------|------|---------|
| `development` | 開発用 dev client | 内部 + iOSシミュレータ | `development` |
| `preview` | テスト配布（実機） | Internal Distribution | `preview` |
| `production` | ストアリリース | App Store / Google Play | `production` |

共通設定: Node 22.14.0 / Sentry DSN 環境変数注入 / `appVersionSource: "remote"` / `autoIncrement: true`

```bash
# 開発ビルド（iOSシミュレータ）
eas build --profile development --platform ios

# テスト配布（実機）
eas build --profile preview --platform all

# 本番リリース
eas build --profile production --platform all

# OTA 更新（JS のみの変更）
eas update --branch preview
```

---

## 画面構成

| 画面 | 概要 |
|------|------|
| **MapScreen** | メイン地図。クラスタリング付きピン表示、タップで詳細シート |
| **RiderScreen** | ライダーダッシュボード。貢献統計6項目 |
| **ParkedScreen** | スポット登録・編集フォーム |
| **MyBikeScreen** | マイバイク管理 |
| **FavoritesScreen** | お気に入りリスト（並び替え・ピン留め対応） |
| **ButlerScreen** | ヘルパー画面 |
| **SpotDetailSheet** | スポット詳細モーダル（レビュー・写真・報告） |
| **LegalScreen** | 利用規約・プライバシーポリシー表示 + 初回同意フロー |

---

## ブランドボイス（コミュニケーション指針）

- ライダー同士の「仲間意識」で語る。上から教えるのではなく、一緒に地図を作る感覚
- 機能説明より「体験」を描写する（例：「ボタンを押す」ではなく「親指一本で仲間を救う」）
- 比較広告的な表現は避ける。自分たちの世界観で語る
