# Moto-Logos（モトロゴス）

## アプリ概要

**正式名称:** Moto-Logos（モトロゴス）  
**略称:** モトロゴ  
**由来:** Moto（バイク） + Logos（言葉・理性・集まり）  
**コンセプト:** 「存在証明」— 自分のメモが、誰かの安心になる。

バイク駐車場の検索アプリではない。**ライダーの存在証明**。車社会の中でバイク置き場は後回しにされ、ライダーは透明人間扱いされる。この地図にライダーの足跡が刻まれていくことで、「俺たちはここにいる」と示す。

### コア・バリュー

1. **足跡を残す** — 「報告」ではなく「自分のためのメモ」。停めた場所を記録するだけで、それが次のライダーの道になる。ボタンサイズ最小 52pt、推奨 64pt 以上
2. **仲間の気配** — 駐車温度システム。ライダーが到着するとピンが温まり、時間とともに冷める。地図を開いた瞬間に「ここ、今誰かいる」がわかる。ライブフィードは焚き火 — 内容より「動いている」ことが大事
3. **利己→結果的利他** — 善意を搾取しない。ライダーが自分のためにやる行動（メモ、写真、次の場所を探す）の中にデータ生成を埋め込む。「報告してください」とは言わない

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
├── hooks/          # カスタムフック（useDatabase, useProximityState, useArrivalDetection, useImpactNotification）
├── utils/          # ユーティリティ（geohash, image-upload, ng-filter, sentry, photoPicker）
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

### 足跡システム（旧: 報告システム）

**設計思想:** 「報告」という言葉・概念を排除する。すべてを「自分のための行動」にし、データは結果的に生まれる。

#### 停められた場合（足跡を残す）
- 到着通知 or 近接カード →「ここに停めた？メモしとく」
- 📸 看板写真（OCRで料金・営業時間を自動抽出 → スポット情報に反映）※将来実装
- 入口・外観写真（任意）
- 完了 → 鮮度（updatedAt）更新 + 駐車履歴に記録
- AsyncStorage `vote_{spotId}` で重複防止
- データは Firestore reviews コレクションに保存（score: 1=停められた）

#### 停められなかった場合（次を探す）
- 「停められなかった？」→ 👎 タップ
- 理由選択（満車 / 閉鎖 / 料金違う / CC制限違う / その他）→ **スキップ可能**
- → 「近くの別の場所を見る」→ 周辺スポット表示 → ナビ連携 → ループ
- **導線の主役は「次の場所」であって「報告」ではない**
- 裏側で「ダメだった」が記録される（結果的利他）

#### 到着通知（新規・P0）
- 「ここ行く」マーク → ナビ連携 → GPS到着検知 → プッシュ通知
- スポットの状態で通知を出し分け:
  - 看板写真なし →「📸 ○○駐車場の看板、メモしとく？」
  - 看板写真あり →「○○駐車場、停められた？」
    - Yes → 鮮度更新 → 完了
    - No → アプリ起動 → 周辺検索（実装済み）

#### 廃止・削除対象
- 旧星レビュー（score 2-5）の後方互換表示 → 完全削除
- 「報告」という用語 → 「足跡」「メモ」に統一

### 到着検知（useArrivalDetection）

スポット詳細から「案内開始」でナビに遷移した後、到着を自動検知してローカル通知を出す。

**アーキテクチャ:**
- `useArrivalDetection` フック（`src/hooks/useArrivalDetection.ts`）
- AsyncStorage `moto_logos_destination` に行き先スポットを保存
- フォアグラウンド/バックグラウンドGPS監視（10秒/15m間隔）
- 50m以内到着で `expo-notifications` ローカル通知を発火

**到着時の自動処理（ボタン不要）:**
- `reportParked()` → Firestore温度UP（他ユーザーの地図が温まる）
- `addFootprint()` → 足跡記録（日記タイムラインに残る）
- `startParking()` → 駐車セッション開始（ライダー画面に「駐車中」表示）

**通知の出し分け:**
- 写真付きレビューなし →「📸 ○○の看板、メモしとく？」
- 写真付きレビューあり →「○○に到着 — 足跡が刻まれました」

**フロー:**
1. SpotDetailSheet →「案内開始」→ `onSetDestination(spot)` → AsyncStorage保存 + GPS監視開始
2. ナビアプリで移動中（Moto-Logosはバックグラウンド）
3. 50m以内到着 → **自動で温度UP + 足跡記録 + 駐車セッション開始** → 通知
4. 通知タップ → アプリ復帰 → 看板写真の撮影（任意）

**制約:**
- アプリが完全にkillされると検知しない（MVP — 将来ジオフェンス対応で解決予定）
- 24時間以上経過した行き先は自動クリア

### 近接コンテキストカード（#90）→ リフレーミング予定

- 現在地と最寄りスポットの距離で3状態を自動判定し、地図下部にカードを表示
- **ニアバイ（≤50m）**: 「ここに停めた？メモしとく」カード
  - 停めた → 📸看板パシャ（任意）→ 完了 → 鮮度更新
  - 停められなかった → 理由（任意・スキップ可）→ 「近くの別の場所を見る」
- **スポットなし（表示圏内0件）**: 「新しい場所を見つけた？」/ 「他を探す」
- **通常（上記以外）**: カード非表示
- クールダウン: AsyncStorage `lastReport_{spotId}` で同一スポット24h以内は抑制
- GPS監視: `Location.watchPositionAsync`（5秒/10m間隔）
- SpotDetailSheet表示中・検索フォーカス中はカード非表示
- 実装: `useProximityState` フック（`src/hooks/`）+ `ProximityContextCard` コンポーネント（`src/components/`）

### 駐車温度システム（地図ピン）

ライダーが到着するとスポットが「温まる」。時間とともに冷める。`currentParkedAt` の経過時間で5段階。

| 温度 | 経過時間 | 色 | 脈動 |
|------|---------|-----|------|
| blazing | 30分以内 | 赤 `#FF3B30` | 1.4倍、0.8秒周期 |
| hot | 2時間以内 | オレンジ `#FF6B00` | 1.25倍、1.2秒周期 |
| warm | 6時間以内 | アンバー `#FF9F0A` | 1.1倍、2秒周期 |
| cool | 24時間以内 | 水色 `#64D2FF` | 静止（オーラのみ） |
| cold | それ以上 | グレー `#48484A` | なし |

- `currentParked > 0` のピンは台数バッジを表示
- ユーザー投稿スポット（cold時）は紫 `#BF5AF2`
- 到着検知で自動書き込み（`reportParked` → Firestore `currentParkedAt` 更新）
- ライダーの行動負担: **ゼロ**。到着=停めたと推定。誤差は24h自動減衰で吸収

### 足跡タイプカラー（ライブフィード・活動タイムライン共通）

| 足跡タイプ | 色 | アイコン | 意味 |
|-----------|-----|---------|------|
| 停められた | 緑 `#30D158` | thumbs-up | ここにいた |
| 満車 | 赤 `#FF453A` | alert-circle | 停められなかった |
| 閉鎖 | 濃グレー `#636366` | close-circle | 閉まっていた |
| 料金違う | 黄 `#FFD60A` | cash-outline | 情報と違った |
| CC制限違う | オレンジ `#FF9F0A` | speedometer-outline | 入れなかった |
| 新規発見 | 紫 `#BF5AF2` | location | 新しい場所を見つけた |

- ライブフィード: 左ボーダー3pxで色分け（焚き火 — 内容より「動いている」ことが大事）
- RiderScreen活動タイムライン: ドット色で色分け（labelテキストから`getReportSubtype()`で自動判定）

### レビューのバイク車種名紐づけ

- `addReview()` に `vehicleName` 引数追加 → Firestore reviews に保存
- 呼び出し元で `getFirstVehicle()` から車種名を取得して渡す
- SpotDetailSheet の ReportCard に「{車種名} で記録」表示（旧: 「で報告」）
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
| **MapScreen** | メイン地図。クラスタリング付きピン表示、タップで詳細シート。ライブフィード（焚き火）・近接コンテキストカード表示 |
| **RiderScreen** | 足跡地図（自分が停めた場所が光る地図）+ 日記タイムライン + 駐車中カード（「出発した」ボタン） |
| **MyBikeScreen** | 愛車プロフィール（CC・メーカー・車種・年式・カラー・写真・ひとこと）→ Firestore同期 |
| **FavoritesScreen** | お気に入りリスト（並び替え・ピン留め対応） |
| **SpotDetailSheet** | 情報ゾーン（上スクロール）+ アクションゾーン（下固定: 案内・報告・シェア） |
| **LiveFeed** | マップ上部のプッシュ通知風ティッカー（焚き火 — 仲間の気配をリアルタイム表示） |
| **ProximityContextCard** | 現在地ベースの足跡カード（≤50mで「ここに停めた？」、スポットなしで「新しい場所を見つけた？」） |
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

空間ルール: **上 = 探す（これから行く場所）、下 = 足跡を残す（今いる場所のこと）**

- **ライブフィード（上部）** — プッシュ通知風にライダーの気配が流れる（焚き火）。設定からON/OFF可能
- **ピルバー（上部）** — ダークグラスのフローティングバー。左に📍現在地ボタン、中央に最寄り1件（タップで展開→3件リスト）、右に🔍検索ボタン
- **カメラボタン（右下）** — ダークグラス52pt丸ボタン。📸アイコン。タップでカメラ起動→写真1枚で場所登録完了
- **近接コンテキストカード（下部）** — 現在地と最寄りスポットの距離で自動表示。≤50mで「停めた→📸看板メモ」「停められなかった→理由（スキップ可）→近くの別の場所」。24hクールダウン付き
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
3. シーン「バイクを降りたら」→ 近接カード → 停めた → 📸看板メモ → 停められなかった → 理由選択 → 通知バナー
4. シーン「新しい場所を見つけたら」→ カメラボタン → 登録完了
5. 完了「あなたの足跡が次のライダーの道になる。」→ GPS現在地に移動

**ダミーデータ:**
- スポット: 東京駅八重洲口バイク駐車場（`_tutorial_spot_`）
- レビュー3件（「広くて停めやすい！」+ 写真、停められた、満車）
- 写真: `assets/tutorial-parking.jpg`
- Firestoreへの書き込みなし（チュートリアル中は全インターセプト）

**チュートリアル終了後:** ダミーデータ削除、GPS現在地にマップ移動、周辺スポット自動フェッチ

---

## コンセプト転換: 「存在証明」（2026-04-14 決定）

### 転換の核

| 項目 | 旧 | 新 |
|------|-----|-----|
| コンセプト | みんなで育てる地図 | ライダーの存在証明 |
| 行為の名前 | 報告 | 足跡・メモ |
| 動機 | 善意・貢献感 | 自分のため（結果的利他） |
| キャッチコピー | 一人の発見を、全ライダーの安心に | 自分のメモが、誰かの安心になる |
| ライブフィードの意味 | 最新情報の確認 | 焚き火（仲間の気配） |
| 到着後の接点 | なし（構造的断絶） | 到着通知（スマート出し分け） |

### 削除対象

| 機能 | 理由 |
|------|------|
| trustScore | 存在に信頼スコアはない |
| ランクシステム（novice/rider/patrol） | 存在に序列はない |
| ゲーミフィケーション（ポイント・バッジ・ランキング） | 報酬で動機づけする思想と矛盾 |
| 貢献者ランキング | 競争原理は気配の世界観と矛盾 |
| 旧星レビュー後方互換表示 | 完全削除 |
| viewCount の UI 表示 | 管理画面用の集計としてのみ残す |

### 新規追加予定

| 機能 | 優先度 | 状態 |
|------|--------|------|
| ~~到着通知~~ | ~~P0~~ | **実装済み** — `useArrivalDetection` + 自動温度UP + 足跡記録 |
| ~~「ここ行く」マーク~~ | ~~P0~~ | **実装済み** — SpotDetailSheet「案内開始」で自動セット |
| ~~料金・営業時間・決済手段フィールド~~ | ~~P1~~ | **実装済み** — priceInfo + SpotPayment + SpotDetailSheet表示 |
| ~~足跡地図（RiderScreen刷新）~~ | ~~P1~~ | **実装済み** — v4: 足跡マップ + 日記タイムライン + 駐車中カード |
| ~~駐車履歴の自動記録~~ | ~~P1~~ | **実装済み** — parking_history テーブル + 到着検知連携 |
| ~~コールドスタート用データ投入~~ | ~~P1~~ | **実装済み** — JMPSA実在79件（温度焚き付け付き） |
| ~~デジタルヤエー通知~~ | ~~P2~~ | **実装済み** — `useImpactNotification` フック |
| ~~カメラロール写真選択~~ | ~~P2~~ | **実装済み** — パシャ + アルバム2択UI |
| ~~入口写真のタグ分け~~ | ~~P2~~ | **実装済み** — 看板/入口/その他のPhotoTag |
| ~~駐車温度システム~~ | — | **実装済み** — 5段階温度 + 脈動ピン + 到着自動記録 |
| 看板OCR | P1 | **保留** — コスト考慮。管理画面で人力入力に変更 |

---

## 技術的負債（リファクタリング）

| Issue | 内容 | 状態 |
|-------|------|------|
| ~~#91~~ | ~~写真ピッキング共通ユーティリティ化~~ | **完了** — `src/utils/photoPicker.ts` |
| ~~#92~~ | ~~カラー定数の一元化~~ | **完了** — `Colors` export、14ファイル統合 |
| ~~#93~~ | ~~TypeScript any型の排除~~ | **完了** — UserSpotRow型付け等 |
| #94 | アクセシビリティラベル追加 | 未完了（P2） |

---

## スポットデータ

- **Firestore: 79件の実在バイク駐車場**（偽データなし）
- ソース: JMPSA（日本二輪車普及安全協会）公開データ + 実在確認済みスポット
- 対象エリア: 東京23区 + 多摩 + 神奈川 + 埼玉 + 千葉 + 茨城 + 栃木 + 群馬 + 静岡 + 山梨 + 長野
- 投入スクリプト: `scripts/importRealData.mjs`（焚き付け温度付き）
- ID命名: `real_` または `jmpsa_` プレフィクス

---

## ブランドボイス（コミュニケーション指針）

- ライダー同士の「気配」で語る。強い繋がりは強要しない。対向車線でのヤエー（ピースサイン）の距離感
- 「報告してください」とは言わない。「ここにいたよ、を残そう」
- 機能説明より「存在の実感」を描写する（例：「ボタンを押す」ではなく「足跡を刻む」）
- 比較広告的な表現は避ける。自分たちの世界観で語る
- Googleマップとの差別化: データの正確さではなく「ユーザーの匂い」「体温のある情報」
