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
| 認証 | Firebase Anonymous Auth（Firestore ルール認可用） |
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
├── components/     # 再利用UI（SpotDetailSheet, NearbySpotsList, ProximityContextCard, TutorialOverlay）
├── contexts/       # React Context（UserContext — ユーザー識別）
├── firebase/       # Firestore/Storage 初期化・CRUD・型定義
├── db/             # SQLite スキーマ・CRUD
├── hooks/          # カスタムフック（useDatabase, useProximityState）
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

### 認証・ユーザー識別システム

- **Firebase Anonymous Auth**: アプリ起動時に `ensureAnonymousAuth()` で匿名サインイン（`src/firebase/config.ts`）
- Firestore セキュリティルールは `request.auth != null` で認可（匿名認証で通過）
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
- `users` コレクション: デバイスID をキーとしたユーザープロフィール（displayName, trustScore, bike情報）
- Firestore ルールは Firebase Console で管理（リポジトリ外）
- **レビューは Firestore がマスター**。SQLite の reviews テーブルはマイグレーション用の読み取り専用レガシー

### 報告システム（停められた / ダメだった）

- 星評価は廃止。「停められた👍 / ダメだった👎」の体験ベース二択
- 「ダメだった」→ 理由選択（満車 / 閉鎖 / 料金違う / CC制限違う / その他）
- ひとこと + 写真を任意で追加可能
- 「停められた」報告 → `reportSpotGood` で鮮度（updatedAt）を更新
- AsyncStorage `vote_{spotId}` で重複報告を防止
- 報告データは Firestore reviews コレクションに保存（score: 1=停められた, 0=ダメだった）
- 旧星レビュー（score 2-5）は「口コミ」ラベルで後方互換表示

### 近接コンテキストカード（#90）

- 現在地と最寄りスポットの距離で3状態を自動判定し、地図下部にカードを表示
- **ニアバイ（≤50m）**: 「停められた👍 / ダメだった👎」の1タップ報告カード
  - 「停められた」→ `reportSpotGood` + review 保存 → 「ありがとう！」→ 2秒で消滅
  - 「ダメだった」→ 理由5択（満車/閉鎖/料金/CC/その他）→ 報告後「他を探す」リスト表示
- **スポットなし（表示圏内0件）**: 「登録する」（FABと同じフロー）/ 「他を探す」
- **通常（上記以外）**: カード非表示
- クールダウン: AsyncStorage `lastReport_{spotId}` で同一スポット24h以内は抑制
- GPS監視: `Location.watchPositionAsync`（5秒/10m間隔）
- SpotDetailSheet表示中・検索フォーカス中はカード非表示
- 実装: `useProximityState` フック（`src/hooks/`）+ `ProximityContextCard` コンポーネント（`src/components/`）

### 鮮度カラー（地図ピン）

- `updatedAt` に基づいてピンの色を自動変更:
  - 1ヶ月以内 → 青 `#0A84FF`（信頼）
  - 3ヶ月以内 → 黄 `#FFD60A`（注意）
  - 6ヶ月以上 → 赤 `#FF453A`（要確認）
- ユーザー投稿スポットは常に紫 `#BF5AF2`

### 報告タイプカラー（ライブフィード・活動タイムライン共通）

| 報告タイプ | 色 | アイコン | 用途 |
|-----------|-----|---------|------|
| 停められた | 緑 `#30D158` | thumbs-up | 安心。行ける |
| 満車 | 赤 `#FF453A` | alert-circle | 危険。避けろ |
| 閉鎖 | 濃グレー `#636366` | close-circle | 死んでる |
| 料金違う | 黄 `#FFD60A` | cash-outline | 注意。想定と違う |
| CC制限違う | オレンジ `#FF9F0A` | speedometer-outline | 入れないかも |
| 新規登録 | 紫 `#BF5AF2` | location | 発見。新しい情報 |

- ライブフィード: 左ボーダー3pxで色分け
- RiderScreen活動タイムライン: ドット色で色分け（labelテキストから`getReportSubtype()`で自動判定）

### レビューのバイク車種名紐づけ

- `addReview()` に `vehicleName` 引数追加 → Firestore reviews に保存
- 呼び出し元で `getFirstVehicle()` から車種名を取得して渡す
- SpotDetailSheet の ReportCard に「{車種名} で報告」表示
- ライブフィードのダミーデータに車種名付き（CBR650R, PCX150, MT-07 等）

### アクティビティログ

- SQLite `activity_log` テーブルでアクション履歴を記録
- 種別: `spot`（スポット登録）/ `review`（口コミ投稿）/ `report`（確認報告）/ `favorite`（お気に入り）
- RiderScreen のタイムラインに実データ表示（相対時刻付き）

### お気に入り参照整合性

- FavoritesScreen / FavoritesListModal で、削除済みスポットのお気に入りを自動クリーンアップ
- ゴーストレコード（spot === null）は SQLite から自動削除

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
- ImagePicker の結果は必ず `result.assets?.length` をチェックしてからアクセス
- Firestore バッチ読み取り: `where('__name__', 'in', [...])` は10件チャンク分割必須（Firestore制約）
- N+1 クエリ禁止: 複数ドキュメント取得は `Promise.all` で並列化

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
| **MapScreen** | メイン地図。クラスタリング付きピン表示、タップで詳細シート。ライブフィード・近接コンテキストカード表示 |
| **RiderScreen** | 貢献ダッシュボード（発見/更新の2軸）+ 活動タイムライン |
| **MyBikeScreen** | 愛車プロフィール（CC・メーカー・車種・年式・カラー・写真・ひとこと）→ Firestore同期 |
| **FavoritesScreen** | お気に入りリスト（並び替え・ピン留め対応） |
| **SpotDetailSheet** | 情報ゾーン（上スクロール）+ アクションゾーン（下固定: 案内・報告・シェア） |
| **LiveFeed** | マップ上部のプッシュ通知風ティッカー（ライダーの活動をリアルタイム表示） |
| **ProximityContextCard** | 現在地ベースの自動アクション提示カード（≤50mでニアバイ報告、スポットなしで登録誘導） |
| **NotificationsScreen** | お知らせ一覧（Firestore announcements + 既読管理 + タップ詳細モーダル） |
| **InquiryScreen** | お問い合わせフォーム（バグ報告・機能リクエスト・不正報告） |
| **SettingsScreen** | 設定（通知ON/OFF・ライブフィードON/OFF・法的文書・アカウント削除・チュートリアル再開） |
| **LegalScreen** | 利用規約・プライバシーポリシー表示 + 初回同意フロー + 第三者提供同意 |
| **TutorialOverlay** | セットアップ（ニックネーム+CC選択）+ 完了画面 |
| **TutorialGuide** | インタラクティブガイドツアー（スポットライト暗幕+パルスグロー+指示テキスト） |

### ナビゲーション（ボトムタブ 4タブ構成）

| タブ | 画面 | アイコン |
|------|------|----------|
| マップ | MapScreen | `map` |
| ライダー | RiderScreen（→ マイバイクサブ画面） | `person` |
| お知らせ | NotificationsScreen | `notifications` |
| 設定 | SettingsScreen（→ お問い合わせ・利用規約サブ画面） | `settings` |

**タブ2度押し動作:**
- マップ → 現在地にリセット
- ライダー / お知らせ / 設定 → マップに戻る

### マップ操作UI

空間ルール: **上 = 探す（これから行く場所）、下 = 報告する（今いる場所のこと）**

- **ライブフィード（上部）** — プッシュ通知風にライダーの活動が流れる。設定からON/OFF可能
- **ピルバー（上部）** — ダークグラスのフローティングバー。左に📍現在地ボタン、中央に最寄り1件（タップで展開→3件リスト）、右に🔍検索ボタン
- **カメラボタン（右下）** — ダークグラス52pt丸ボタン。📸アイコン。タップでカメラ起動→写真1枚で場所登録完了
- **近接コンテキストカード（下部）** — 現在地と最寄りスポットの距離で自動表示。≤50mで「停められた👍/ダメだった👎」→ 写真パシャッ誘導。スポット0件で「登録する/他を探す」。24hクールダウン付き
- **エリア自動再検索** — 地図を移動すると表示範囲の30%以上移動時に自動でスポット再取得（デバウンス800ms）
- スポット詳細シート表示中はカメラボタン・ピルバー・近接カードを非表示

### インタラクティブガイドツアー（ソシャゲ式チュートリアル）

初回起動時 / 設定画面から再開可能。実際のUIをタップさせて操作を覚えさせる。

**アーキテクチャ:**
- `TutorialContext` (`src/contexts/TutorialContext.tsx`): 全ステップ定義 + 状態管理 + ダミースポット
- `TutorialOverlay` (`src/components/TutorialOverlay.tsx`): セットアップ画面 + 完了画面
- `TutorialGuide` (`src/components/TutorialGuide.tsx`): スポットライト（4矩形暗幕）+ パルスグロー + 指示テキスト

**フロー（24ステップ）:**
1. セットアップ: ニックネーム + CC選択（「探したい排気量のバイクは？」）
2. シーン「バイク置き場を探す」→ ピルバータップ → 詳細シート（バッジ→鮮度→口コミ）→ 案内開始 → 検索自動入力
3. シーン「バイクを降りたら」→ 近接カード → 停められた👍 → 写真投稿 → ダメだった👎 → 理由選択 → 通知バナー
4. シーン「新しい場所を見つけたら」→ カメラボタン → 登録完了
5. 完了「あなたの一報がマップに命を灯す。」→ GPS現在地に移動

**ダミーデータ:**
- スポット: 東京駅八重洲口バイク駐車場（`_tutorial_spot_`）
- レビュー3件（「広くて停めやすい！」+ 写真、停められた、満車）
- 写真: `assets/tutorial-parking.jpg`
- Firestoreへの書き込みなし（チュートリアル中は全インターセプト）

**チュートリアル終了後:** ダミーデータ削除、GPS現在地にマップ移動、周辺スポット自動フェッチ

---

## 技術的負債（リファクタリング予定）

| Issue | 内容 | 優先度 |
|-------|------|--------|
| #91 | 写真ピッキングロジックの共通ユーティリティ化（4箇所重複） | P2 |
| #92 | カラー定数の一元化（5+ファイルで重複定義） | P2 |
| #93 | TypeScript `any` 型の排除（8箇所） | P2 |
| #94 | アクセシビリティラベル追加（25+要素） | P2 |

---

## ブランドボイス（コミュニケーション指針）

- ライダー同士の「仲間意識」で語る。上から教えるのではなく、一緒に地図を作る感覚
- 機能説明より「体験」を描写する（例：「ボタンを押す」ではなく「親指一本で仲間を救う」）
- 比較広告的な表現は避ける。自分たちの世界観で語る
