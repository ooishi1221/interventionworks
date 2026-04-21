# Moto-Logos（モトロゴス）

## アプリ概要

**正式名称:** Moto-Logos（モトロゴス）  
**略称:** モトロゴ  
**由来:** Moto（バイク） + Logos（言葉・理性・集まり）  
**コンセプト:** 「存在証明」— ワンショットが足跡を刻む。足跡が誰かの地図になる。

**ライダーの全体験を写真1枚で刻む地図。** バイク駐車場の検索アプリではない。停めた場所、食った飯、見た景色 — ライダーがパシャッと撮った1枚をAIが判別し、ライダーノートに残り、誰かの地図になる。

### ビジョンと戦略

**ビジョン:** ライダーの存在証明。ワンショットが足跡を刻み、足跡が誰かの地図になる。

**最初の検証カテゴリ:** バイク駐車場。都市部のライダーが日常的に直面する「停める場所がない」痛みに集中する。地方ツーリングでは駐車に困らない — この課題は都市特有であり、だからこそ刺さる。

**ターゲット:** 首都圏の都市ライダー。東京23区+横浜・川崎・さいたま・千葉市を主戦場とし、データ密度で「開けば必ず見つかる」体験を保証する。拡張は地方ではなく都市間横展開（東京→大阪→名古屋→福岡）。

**ポジショニング:** 「都市ライダーの駐車場マップ」ではなく、**ワンショットが足跡を刻む。足跡が誰かの地図になる。** ライダーが自分のために撮った1枚が積み重なり、次のライダーの道になる — これがGoogleにもNAVITIMEにもない非対称優位。

**ワンショットOS思想:** ワンショット（写真1枚）がプロダクトのOS。駐車場はその最初のアプリ。ライダーは「駐車場を撮ろう」「カフェを撮ろう」と考えない。停めた、飯食った、いい景色だった → パシャ。AIが「駐車場の入口」「ラーメン屋」「景色」と自動分類する。カテゴリを手動で増やすのではなく、ワンショットという行為を拡張することで地図が育つ。

**βスコープ:** 駐車場のみ。ただしワンショットのUIは駐車場専用に閉じない。写真 → AI解析 → 分類のパイプラインを汎用に設計する。

**将来の拡張:** カフェ・飯屋、景色スポット、注意ポイント（路面・取締り）、ツーリングルート等。カテゴリ追加ではなく、AI分類の精度向上で自然に広がる。「いいな」と思った瞬間すべてがアプリを開く理由になる — これがリテンションの本質的な解。

### 目指す方向性: 「同じバイクに乗る仲間の足跡」

Kindleの「ポピュラー・ハイライト」のように、**誰が良いと言ったかで情報の価値が変わる**。星3.8という平均値には個性がないが、「XSR900乗りの女性ライダーがここを気に入った」には共感が生まれる。

バイクは自然なパーソナライズ軸になる:
- 排気量で物理的に停められる場所が変わる
- 車種・スタイルで「良い」の基準が変わる（レブル乗りとXSR乗りの感性は違う）
- 性別・体格で駐車場の使い勝手が変わる

**これはアルゴリズムによるレコメンドではなく、「バイク」という自然なフィルタによるパーソナライズ。** Google にも YAMAP にも食べログにもできない。バイクという乗り物の特性上、車種が情報の信頼性に直結するからこそ成立する。

実現イメージ: 「自分と同じバイクの足跡だけ見る」フィルタ。同じCCのライダーが「入れた」と言ってるなら、自分も入れる — これが最も信頼できる情報。

データの準備状況: MyBike に排気量・車種が登録済み、レビューに `vehicleName` が紐づく構造は実装済み。足跡データが溜まった段階でフィルタUIを追加する。

### プロダクトの2つの軸と接続

| 軸 | ユーザーの課題 | タイミング |
|----|--------------|-----------|
| **A. 実用（検索）** | バイク駐車場の情報は信用ならない。信頼できる場所を見つけたい | バイクを降りる前後 |
| **B. 感情（存在証明）** | ライダー同士の繋がりを感じたい。乗ってない時間もライダーでいたい | 走行の合間、日常 |

**AとBは別のニーズではない。同じサイクルの別のフェーズ:**
- Aは足跡を消費する（誰かの足跡があるから信頼できる情報で場所を見つけられる）
- Bは足跡を生産する（自分が停めた記録が次のライダーの信頼できる情報になる）

```
A: 検索で場所を見つける（足跡を消費）
   → 到着 → 停める
   → B: 足跡を残す（次の人のAを生産）
   → 通知「あなたの足跡が役に立った」
   → 次にアプリを開く理由（Aに戻る）
```

**このループの「A→B」の橋（到着後に足跡を残すUX）と「B→A」の橋（通知で呼び戻す）が現在の最重要課題。**

### コア・バリュー

1. **足跡を残す** — 「報告」ではなく「自分のためのメモ」。停めた場所を記録するだけで、それが次のライダーの道になる。ボタンサイズ最小 52pt、推奨 64pt 以上
2. **ワンショット（写真1枚）** — 到着したら写真を1枚撮るだけ。それがライダーノートに残り、副産物としてスポットの鮮度が更新される。「報告」ではなく「自分のメモ」。何度でも撮れる（撮影済み制限なし）
3. **利己→結果的利他** — 善意を搾取しない。ライダーが自分のためにやる行動（メモ、写真、次の場所を探す）の中にデータ生成を埋め込む。「報告してください」とは言わない

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Expo SDK 54 / React Native 0.81 / React 19 |
| 言語 | TypeScript 5.9（strict mode） |
| クラウドDB | Firebase Firestore（オフライン永続キャッシュ有効）+ Firebase Storage（写真） |
| ローカルDB | expo-sqlite（WAL モード、ユーザーデータ・評価・足跡・駐車履歴） |
| 画像表示 | expo-image（ディスクキャッシュ + ネイティブデコード） |
| 地図 | react-native-maps + react-native-map-clustering |
| アニメーション | react-native-reanimated + react-native-gesture-handler |
| 空間検索 | Geohash プレフィクスクエリ（自前実装、外部依存なし） |
| クラッシュ監視 | Sentry `@sentry/react-native ~7.2.0`（org: `moto-logos-team`） |
| ビルド/配信 | EAS Build（development / preview / production）、EAS Update（OTA） |
| 認証 | Firebase Auth（匿名 + Apple Sign-In + Google Sign-In） |
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
- SQLite にユーザー操作（評価、マイバイク、足跡、駐車履歴）を即時保存
- ネットワーク復帰時に Firestore へ自動同期

### フォルダ構成

```
src/
├── screens/        # 画面コンポーネント（MapScreen, RiderScreen 等）
├── components/     # 再利用UI（SpotDetailSheet, SearchResultsList, TutorialOverlay）
├── contexts/       # React Context（UserContext — ユーザー識別）
├── firebase/       # Firestore/Storage 初期化・CRUD・型定義
├── db/             # SQLite スキーマ・CRUD
├── hooks/          # カスタムフック（useDatabase, useImpactNotification, usePhotoPicker）
├── utils/          # ユーティリティ（geohash, distance, image-upload, ng-filter, sentry, photoPicker）
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
- **アイコンセット** — Ionicons + MaterialCommunityIcons + FontAwesome5（マップピンの motorcycle）

---

## 開発ルール

### コード規約

- TypeScript strict。`any` は原則禁止、やむを得ない場合はコメントで理由を明記
- 関数コンポーネント + hooks のみ（クラスコンポーネント禁止）
- 状態管理は React hooks で完結させる。外部ライブラリ（Redux, Zustand 等）は導入しない
- ファイル名はケバブケース（`spot-detail-sheet.tsx`）、型名はパスカルケース

### 認証・ユーザー識別システム

- **匿名ファースト**: アプリ起動時に `ensureAnonymousAuth()` で匿名サインイン → 即利用開始（ログイン強制なし）
- **ソーシャルログイン（任意連携）**: Apple Sign-In / Google Sign-In でアカウントリンク（`src/firebase/authService.ts`）
  - `linkWithCredential()` で匿名アカウントを昇格 → 足跡がデバイスから解放される
  - 新端末で同じアカウントでサインイン → `signInWithCredential()` でデータ復元
  - 連携時に旧 deviceId ベースの Firestore データを auth.uid に自動移行（`migrateUserData()`）
- **userId**: 連携済み → `auth.uid`、未連携の既存ユーザー → 旧 `deviceId`、新規ユーザー → `auth.uid`
- `UserContext` (`src/contexts/UserContext.tsx`) がアプリ全体に `userId`, `authProvider`, `isLinked` + `linkApple()`, `linkGoogle()`, `logout()` を供給
- Firestore セキュリティルールは `request.auth != null` で認可
- 初回起動時に Firestore `users` コレクションにドキュメントを自動作成
- レビュー・投票には必ず実 userId を紐付ける（`'local_user'` ハードコード禁止）
- **UI**: 設定画面に「アカウント」セクション（`AccountLinkCard`）、初回足跡後にナッジカード（`LinkNudgeCard`）

### 権限要求（通知・位置情報）

起動直後にシステムダイアログを連発させない。**文脈付きで遅延発火**する。

- **通知パーミッション** — 利用規約同意直後ではなく、以下の2タイミングで要求:
  1. チュートリアル完了（「さあはじめよう！」or スキップ）→ `App.finishTutorial`
  2. 初回ワンショット完了 → `MapScreen.onOneshotCompleted`
- **位置パーミッション** — 起動時の Phase 1 では `getForegroundPermissionsAsync()` で**既存状態の取得のみ**。要求は周辺検索FABタップ等のユーザー意図ある操作で初めて発火（`Location.requestForegroundPermissionsAsync()`）
- **PrePermissionDialog** (`src/components/PrePermissionDialog.tsx`) — システム権限ダイアログの直前にブランド準拠のソフト説明カードを1枚挟む。1回拒否されると再表示困難なため許可率を上げる
- **`permissionPrompts.ts`** — `shouldShowXxxPrompt()` で「未案内 + 未許可」を判定し、`markXxxPromptShown()` で AsyncStorage に記録して二重表示を防ぐ

### 写真アップロード（Firebase Storage）

- レビュー写真は Firebase Storage にアップロードし、公開 URL を Firestore `reviews.photoUrls` に保存
- アップロード前に `expo-image-manipulator` で圧縮（max 1024px, JPEG quality 0.7）
- Storage パス: `reviews/{spotId}/{userId}_{timestamp}.jpg`
- アップロード中はプログレスバーを表示
- ローカル URI を直接 Firestore に保存しない

### 画像表示（expo-image）

- RN 標準 `Image` は使わない。全画像表示に `expo-image` の `Image` を使用（ディスクキャッシュ + ネイティブデコード）
- `source` は文字列 URI を直接渡す（`source={uri}` / `{{ uri }}` 形式は不要）
- サムネイル表示には `transition={200}` でフェードイン + `cachePolicy="disk"` を指定
- `resizeMode` ではなく `contentFit` を使う（expo-image の API）
- RiderScreen のワンショットグリッドは `FlatList` + `numColumns={3}` で仮想化（`.map()` で全件レンダーしない）
- SpotDetailSheet のギャラリー FlatList には `initialNumToRender` / `maxToRenderPerBatch` / `removeClippedSubviews` / `getItemLayout` を必ず指定

### 星図（Star Map）

- ライダーノートのプロフィールヘッダーにミニ星図（48pt丸）を配置。タップでフルスクリーン展開
- `STAR_MAP_STYLE`（`src/constants/mapStyle.ts`）— ラベル全消し・極暗マップスタイル。道路・海岸線のみダークグレーで残す
- `StarMarker` — 3層同心円グロー（outer→mid→core）。shadow不使用。訪問回数で3段階（1回/2回/3回+）
- 軌跡ライン — 初訪問順（同一スポット再訪はスキップ）のPolyline。古い→新しいでopacityグラデーション（0.15→0.60）
- フルスクリーン演出:
  - 最初の足跡にストリートレベル（delta 0.004）で寄ってスタート
  - 線が30fpsで伸び、セグメント開始時にカメラが次のスポット方向へ先読みパン
  - 到達で星が点灯（opacity 0→1）
  - 全完了で800msかけて全体像に引く
- `tracksViewChanges={true}` 必須（カスタムMarkerのビットマップ化タイミング問題を回避）

### Firestore 運用

- 新規スポットには必ず `geohash`（精度9）を付与する
- Read 数を意識する。`fetchSpotsInRegion` は geohash クエリで範囲検索し、0件でもそのまま返す。`fetchAllSpots` はインデックス未作成時の緊急フォールバックのみ
- `user_activity` コレクション: アプリ起動時に1日1回 userId と日付を記録（DAU/WAU/MAU 集計用）
- `users` コレクション: auth.uid をキーとしたユーザープロフィール（displayName, bike情報）。旧ユーザーは deviceId キーのまま（連携時に移行）
- Firestore ルールは Firebase Console で管理（リポジトリ外）
- **レビューは Firestore がマスター**。SQLite の reviews テーブルはマイグレーション用の読み取り専用レガシー

### 足跡システム（旧: 報告システム）

**設計思想:** 「報告」という言葉・概念を排除する。すべてを「自分のための行動」にし、データは結果的に生まれる。

#### 停められた場合（足跡を残す）
- 📸 ワンショット撮影 — 写真1枚でライダーノートに保存 + スポット鮮度が副産物として更新
- 完了 → **ワンショットセレモニー演出**（後述）→ 鮮度（lastVerifiedAt）更新 + 駐車履歴に記録
- AsyncStorage `vote_{spotId}` で重複防止
- データは Firestore reviews コレクションに保存（score: 1=停められた）

#### ワンショットセレモニー演出（#175）

標準カメラとの決定的な差別化。撮った瞬間に「地図に刻まれた」を視覚・触覚で叩き込む儀式。

**シーケンス:**
1. SpotDetailSheet が即座に閉じる（地図が見える）
2. 白フラッシュ + 大振動（Haptics Success）
3. 撮った写真が画面中央にドロップイン（spring）
4. 「足跡を刻みました — スポット名 / N枚目」テキスト表示
5. 写真が縮小しながら下に移動（地図に吸い込まれる）
6. 完了（タップで即スキップ可能）

**実装:** `src/components/OneshotCeremony.tsx`
- Animated API（native driver）ベース
- MapScreen 内で state 管理、SpotDetailSheet + quickReport 両方からトリガー
- 連打ガード（3.5秒クールダウン）

**設計方針（#175 議論で確定）:**
- ライダーノートにAI解析データ・バッジを表示しない（プラットフォームの仕事をライダーの記録に混ぜない）
- AI抽出データ（料金等）はスポット詳細画面に反映して完結（#173の範囲）
- ライダーノートのカードはシンプル（写真+場所名+時刻）

#### 「停められなかった」フロー（廃止）
- ワンショットの世界に「失敗」はない。「いた」か「撮らなかった」かだけ
- 既存のscore=0データは足跡として静かに残すが、新規UIは削除済み

#### 廃止・削除対象
- 旧星レビュー（score 2-5）の後方互換表示 → 完全削除
- 「報告」という用語 → 「足跡」「メモ」に統一

### 気配システム（地図ピン）

スポットに残された**ライダーの「気配」**を `lastVerifiedAt`（= lastConfirmedAt）の経過時間で6段階表現。ワンショット撮影で `reportParked()` が呼ばれると副産物として更新される。選択ピンのオレンジ `#FF6B00` と色相を分離。刑事/追跡の "warm trail / cold trail" 慣用句をメタファに採用。

| 気配 | 経過時間 | 色 | 意味 |
|------|---------|-----|------|
| live   | 1ヶ月以内 | 黄 `#FFD60A` | 濃い気配。薄グロー付きで最も目立つ |
| warm   | 1〜2ヶ月 | 琥珀 `#FFAE42` | 温かい気配 |
| trace  | 2〜3ヶ月 | 白 `#E8E8E8` | 痕跡が残る |
| faint  | 3〜6ヶ月 | シアン `#5AC8FA` | 薄れた気配 |
| cold   | 半年以上 | 深青 `#3A6B9C` | 冷えきった |
| silent | 記録なし | 中空リング | 静寂・未踏。構造で別扱い |

- 全ピン透明度1.0（霧システム廃止。全スポットがダークマップ上で視認可能）
- ピンアイコンは `motorcycle`（FontAwesome5）。MDI motorbike は小サイズで自転車に見えるため差し替え済み
- マーカーは source（seed/user）で区別しない。気配の色のみで表現
- silent（未踏）は中空リング（塗りなし + 白グレーストローク）で視認性を保持しつつ「誰も来てない」を構造的に表現
- live のみ薄黄グローを付加して「最近の気配」を目立たせる
- 広域ズーム時のドット: 22×22px + 白stroke 2px
- ワンショット撮影時に `reportParked()` で `lastVerifiedAt` が副産物として更新
- 実装: `src/utils/freshness.ts`（spotFreshness / FRESHNESS_STYLE / freshnessLabel / lastConfirmedText）
- SpotDetailSheet 内の `FreshnessIndicator` が5段階カラーゲージ + ラベル + 経過日数をタイトル直下に表示（マップピンと色連動）

### 足跡タイプカラー（活動タイムライン）

| 足跡タイプ | 色 | アイコン | 意味 |
|-----------|-----|---------|------|
| 停められた | 緑 `#30D158` | thumbs-up | ここにいた |
| 満車 | 赤 `#FF453A` | alert-circle | 停められなかった |
| 閉鎖 | 濃グレー `#636366` | close-circle | 閉まっていた |
| 料金違う | 黄 `#FFD60A` | cash-outline | 情報と違った |
| CC制限違う | オレンジ `#FF9F0A` | speedometer-outline | 入れなかった |
| 新規発見 | 紫 `#BF5AF2` | location | 新しい場所を見つけた |

- RiderScreen活動タイムライン: ドット色で色分け（labelテキストから`getReportSubtype()`で自動判定）

### レビューのバイク車種名紐づけ

- `addReview()` に `vehicleName` 引数追加 → Firestore reviews に保存
- 呼び出し元で `getFirstVehicle()` から車種名を取得して渡す
- SpotDetailSheet の ReportCard に「{車種名} で記録」表示（旧: 「で報告」）
- チュートリアルのダミーレビューに車種名付き

### アクティビティログ

- SQLite `activity_log` テーブルでアクション履歴を記録
- 種別: `spot`（スポット登録）/ `review`（口コミ投稿）/ `report`（確認報告）
- RiderScreen のタイムラインに実データ表示（相対時刻付き）

### お気に入り機能（廃止）

- お気に入り（ハート）機能はβ前整理で廃止。足跡日記が自然に代替
- FavoritesScreen / FavoritesListModal は削除済み
- SQLite favorites テーブルはスキーマとして残存（データ破棄不要）

### 環境変数

- `.env` に Firebase + Sentry 設定値を格納（`EXPO_PUBLIC_` プレフィクス必須）
- `.env.example` に必要なキー一覧あり（値は空）。新規メンバーはこれをコピーして Firebase Console / Sentry から値を取得する
- **`.env` は `.gitignore` 対象で git 未追跡。EAS Build には自動で転送されない**
- **EAS Build には `eas env:push preview --path .env --force` で Secrets 登録する必須**（production も同様）
- 確認は `eas env:list preview`
- 未登録時の症状: Firebase 初期化で `auth/invalid-api-key` → 全 Firestore クエリが permission-denied → 新規インストール1回目で「ピン0件」「Alertも出ない」無言死
- 過去事例（2026-04-20）: 環境変数未登録で iOS/Android 両方動作不能。診断Alertで `DEBUG2 認証FAIL: auth/invalid-api-key` を確認して発覚
- `.env` を変更／新キー追加時は必ず `eas env:push` を打ち直す

### デバッグ Alert スイッチ（DEBUG_ALERT）

調査用に画面に Alert を出すデバッグ機構を `src/utils/debug.ts` に集約。**β配布前は必ず `DEBUG_ALERT = false`**。

- 影響範囲:
  - `MapScreen.tsx`: fetchSpotsInRegion の結果 / エラーを Alert（0件問題の調査用）
  - `SearchOverlay.tsx`: chipPress のエラー詳細を Alert（Places API 調査用）
- 通常の Alert（位置情報拒否・検索失敗など）は DEBUG_ALERT に依存しない常時表示
- 個別フラグではなく単一スイッチに統一（過去事例: 2026-04-20 に SearchOverlay へ仕込んだまま CEO がβ実機で遭遇 → 一括制御に変更）

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
- `console.warn` / `console.error` でのエラー処理は禁止。すべて `captureError()` を使う
- ImagePicker の結果は必ず `result.assets?.length` をチェックしてからアクセス
- Firestore バッチ読み取り: `where('__name__', 'in', [...])` は10件チャンク分割必須（Firestore制約）
- N+1 クエリ禁止: 複数ドキュメント取得は `Promise.all` で並列化

### βフィードバック基盤

**2層構成でβテスターのエラー・意見をキャッチ:**

| 層 | トリガー | コレクション | 仕組み |
|---|---------|------------|--------|
| 自動 | `captureError()` 発火 | `beta_errors` | エラー発生 → 端末情報+userId自動収集 → Firestore → Slack即時通知。60秒レート制限 |
| 任意 | 左下「報告」ボタン | `beta_feedback` | カテゴリ3択（バグ/意見/わからない）+ テキスト + 任意写真 → Firestore → Slack通知 |

**関連ファイル:**
- `src/utils/sentry.ts` — `captureError()` 内で `_writeBetaError()` をfire-and-forget呼び出し。`setBetaUser(userId)` でユーザー識別
- `src/components/BetaFeedbackButton.tsx` — フローティングピル + モーダルUI
- Slack Bot `src/firestore-watcher.js` — firebase-admin で両コレクションを onSnapshot 監視

**Slack通知フォーマット:**
- エラー: `🚨 Beta Error` + エラーメッセージ + context + 端末情報 + スタックトレース
- フィードバック: `💬 Beta Feedback [カテゴリ]` + メッセージ + 写真 + 端末情報

### 通報・ブロック・モデレーション（Apple Guideline 1.2 準拠）

ワンショット投稿に対する3層のUGC安全機構。βリリース前に必須。

| 層 | 発火点 | 実装 |
|---|--------|------|
| **事前フィルタ** | ワンショット送信直前 | `src/utils/moderation.ts` → Admin API `/api/public/moderate-photo` → Gemini Vision で公序良俗違反を弾く |
| **通報** | ReportCard 右上🚩（自分の投稿には非表示） | `src/components/ReportModal.tsx` → Firestore `reports` → Slack #moto-logos-dev-log + Admin `/reports` |
| **ブロック** | 通報モーダル内「このライダーをブロック」デフォルトON | `src/contexts/UserBlocksContext.tsx` で購読 → `SpotDetailSheet` でフィルタ |

**設定導線:** 設定 → プライバシー → 「ブロック中のライダー」（件数バッジ + 解除Modal）

**Firestore 構造:**
- `reports/{id}` — reviewId / spotId / reporterUid / reason ('inappropriate'|'spam'|'misleading'|'other') / description / status ('open'|'resolved'|'dismissed') / targetUserId (denorm)
- `user_blocks/{uid}` — `blocked: string[]` (arrayUnion/arrayRemove) + updatedAt

**通報UI理由:** 公序良俗違反（=inappropriate）/ スパム / その他（App側は3択、Admin側は misleading 含む4種）

**Gemini コスト:** 2.5-flash-lite で 1判定 ≈ 0.00002 USD。月1万で 30 円。

**設計方針:**
- 通報ボタンは目立たせない（ワンショット思想「評価しない・競わない」と矛盾させない最小UI）
- ブロックは silent（相手に通知しない）
- Gemini は判定失敗時 approve（UX優先）
- Admin側のスキーマに合わせている（reviewId / reporterUid / description / status=open）

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
| **RiderScreen** | ライダーノート v8（Instagram型プロフィール）: 丸バイク写真(80pt) + カウンター(ワンショット数/スポット数) + ミニ星図(48pt丸) + 車種名 + CC選択ピル + TOP3ストーリーズ風(オレンジリング丸72pt) + ワンショット3列グリッド(FlatList仮想化) + 星図フルスクリーンModal(初訪問順トレイルアニメーション+カメラ追従) |
| **SpotDetailSheet** | 情報ゾーン（上スクロール: 鮮度テキスト + 情報更新日 + 写真ギャラリー + 住所 + 精算・料金 + 足跡一覧）+ アクションゾーン（下固定: 案内・📷ワンショット・シェア） |
| **SearchOverlay** | テキスト検索のフルスクリーン入力画面。サーチタブ2回目タップで開く。テキスト入力→ジオコーディング→座標+エリア名を返す |
| **NotificationsScreen** | お知らせ一覧（Firestore announcements + 既読管理 + タップ詳細モーダル） |
| **InquiryScreen** | お問い合わせフォーム（バグ報告・機能リクエスト・不正報告） |
| **SettingsScreen** | 設定（通知ON/OFF・法的文書・アカウント削除・チュートリアル再開） |
| **LegalScreen** | 利用規約・プライバシーポリシー表示 + 初回同意フロー + 第三者提供同意 |
| **TutorialOverlay** | セットアップ（CC選択のみ）+ 完了画面 |
| **TutorialGuide** | インタラクティブガイドツアー（スポットライト暗幕+パルスグロー+指示テキスト） |

### ナビゲーション（フッター5タブ、アイコンのみ・テキストなし）

| 位置 | 画面 | アイコン |
|------|------|----------|
| 1 | MapScreen | `home` / `home-outline` |
| 2 | サーチ（MapScreen上で動作） | `search` / `search-outline` |
| **3（中央突き出し）** | **ワンショット撮影** | `camera`（72pt丸、オレンジ `#FF6B00`） |
| 4 | RiderScreen（ライダーノート） | ユーザーのバイク写真（丸アバター）/ `person` |
| 5 | SettingsScreen → サブ: お知らせ・お問い合わせ・利用規約 | `settings`（未読時に赤バッジドット） |

**サーチタブの2段階動作:**
- 1回目タップ → 現在地周辺3件を `SearchResultsList` で展開表示
- 2回目タップ → `SearchOverlay`（テキスト検索）を開く
- テキスト検索後 → エリアに飛ぶ → そのエリアの最寄り3件を展開表示

**設定への導線:** フッター⚙️タブ → SettingsScreen

**お知らせへの導線:** 設定 → サポートセクション最上部「お知らせ」行（未読時にバッジドット）→ NotificationsScreen

**タブ2度押し動作:**
- マップ → 現在地にリセット + サーチ状態クリア
- ライダー → マップに戻る
- 設定 → サブ画面リセット

### 構想の変遷

| Phase | 構想 | 課題 |
|-------|------|------|
| A | ワンタップでスポット登録・更新 | — |
| B | スポット登録は偶然の産物。メインは「停めた」の足跡 | — |
| C | 停めた後にアプリを開く動機がない → エリア検知PUSHでワンタップ。検索と通知は画面上部に集約 | — |
| D | 検索がなければ何も始まらない | — |
| **E** | **都市ライダーに集中。地方では困らない。首都圏の「あるある」こそ最鋭の刃** | **← 現在地点** |

検索こそがアプリの入口。存在証明はその先で回るループ。ただし、この痛みは都市でしか発生しない。首都圏の都市ライダーに深く刺さるプロダクトを作り、薄く全国に広げない。

### 検索設計

検索は2種類しかない。

#### 未来検索（出発前）

> 「これから行く○○は空いてるかな？周辺にあるかな？ルートはどうかな？」

- **入力:** テキスト（「渋谷」「東京ドーム」など地名・施設名）
- **欲しい情報:** 場所、料金、営業時間
- **身体の状態:** 両手フリー、画面に集中できる
- **UI:** サーチタブ2回目 → `SearchOverlay`（フルスクリーン）→ テキスト入力 → ジオコーディング → 地図移動 → `SearchResultsList` で最寄り3件表示 → ×で解除→現在地復帰

#### 現在検索（到着直後）

> 「うわ、空いてないじゃん。他に近くにないかな」

- **入力:** ワンタップ
- **欲しい情報:** 今空いてるか、ここから近いか
- **身体の状態:** グローブ越し、片手、焦ってる
- **UI:** サーチタブ1回目 → `SearchResultsList` で最寄り3件表示 → タップで詳細シート

#### 空間ルールとの対応

**サーチタブが両方の検索を統合。** 1回目=現在検索（周辺3件）、2回目=未来検索（テキスト検索→エリア移動→最寄り3件）

### マップ操作UI

- **フッタータブバー（5アイテム）** — 🏠マップ / 🔍サーチ / 📸ワンショット（72pt突き出し）/ 丸アバター（ライダー）/ ⚙️設定。アイコンのみ・テキストなし。Instagram風デザイン
- **SearchResultsList** — サーチタブ押下時に地図上部にフローティング表示。最寄り3件を鮮度ドット付きで表示。テキスト検索後はエリア名+×クリアボタン付き
- **エリア自動再検索** — 地図を移動すると表示範囲の30%以上移動時に自動でスポット再取得（デバウンス800ms）
- **wideZoomヒステリシス** — 広域モード切替は単一閾値ではなくバンド（0.04〜0.06）。境界帯では状態維持し、500ピンの一斉再レンダーを防止

### インタラクティブガイドツアー（ソシャゲ式チュートリアル）

初回起動時 / 設定画面から再開可能。実際のUIをタップさせて操作を覚えさせる。

**アーキテクチャ:**
- `TutorialContext` (`src/contexts/TutorialContext.tsx`): 全ステップ定義 + 状態管理 + ダミースポット
- `TutorialOverlay` (`src/components/TutorialOverlay.tsx`): セットアップ画面 + 完了画面
- `TutorialGuide` (`src/components/TutorialGuide.tsx`): スポットライト（4矩形暗幕）+ パルスグロー + 指示テキスト

**フロー（18ステップ — 全ステップがユーザータップで進行）:**

| # | ステップ | 内容 |
|---|---------|------|
| 1 | setup | CC選択（ニックネームはRiderScreen初回訪問時に入力） |
| 2 | scene-explore | シーンカード「バイク置き場を探す」 |
| 3 | explore-nearby | 周辺検索FABタップ → 東京駅ダミー3件表示 |
| 4 | explore-result | 結果カードタップ → スポット詳細表示 |
| 5 | explore-nav | ナビボタンタップ → 案内開始アラート |
| 6 | explore-search | サーチタブタップ → SearchOverlay表示 |
| 7 | explore-search-info | 上野チップを target にして「人気エリアの上野を選択してみましょう」（チュートリアル中は文字入力ロック+他チップ無効化） |
| 8 | explore-search-result | 上野ダミー3件注入 → 検索結果表示 |
| 9 | scene-presence | シーンカード「スポットの『気配』」 |
| 10 | presence-intro | 6段階カラーパネル表示（live/warm/trace/faint/cold/silent + 各意味） |
| 11 | presence-action-intro | 「気配はワンショットで更新されます。やってみましょう」 |
| 12 | presence-show-untouched | 未踏ダミーに地図寄せ + カード自動オープン → silent ゲージを見せる |
| 13 | presence-camera | ワンショットボタンタップ → ダミーセレモニー発火 + ピンを silent → live に切替 |
| 14 | presence-ceremony | OneshotCeremony演出 → 完了で次へ。直後にカード再オープン（live ゲージ可視化） |
| 15 | presence-done | 「気配がつきました！MAPのピンとカードのステータスが更新されました」 |
| 16 | presence-ai-update | 「看板など文字や写っている場合 AIが判別して最新の状態に更新されます ※1日1回更新となります」 |
| 17 | presence-encourage | 「ワンショットで気配をどんどん残しましょう！」 |
| 18 | complete | 「ワンショットを撮るほど、地図が育つ。さあはじめよう！」 |

**ダミーデータ:**
- スポット: 東京駅八重洲口バイク駐車場（`_tutorial_spot_`）+ 周辺2件 + 上野3件 + 丸の内仲通り（`_tutorial_untouched_`、silent状態）
- 写真: `assets/tutorial-parking.jpg`（セレモニー演出用）
- 未踏ダミーの気配状態は TutorialContext の `untouchedConfirmed` state で制御。`markUntouchedConfirmed()` で lastConfirmedAt = now を付与 → live に色変化
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
| 足跡の残し方 | 「停めた✓」ボタン | ワンショット撮影（写真1枚がライダーノートになる） |
| 到着後の接点 | なし（構造的断絶） | ワンショット撮影（ライダー主導） |

### 廃止済みの主要概念（参照用）

新コンセプト（ワンショット＋気配）に置換された主要な廃止項目。詳細は git log を参照。

- **ランク・ポイント・バッジ・貢献者ランキング** — 存在に序列なし
- **trustScore / 旧星レビュー** — 評価ではなく気配で表現
- **温度システム（temperature.ts）** → 気配システム（freshness.ts）に置換
- **「停めた✓」ボタン / 「停められなかった」フロー** → ワンショット撮影
- **到着検知（useArrivalDetection） / 近接コンテキストカード** → ライダー主導のワンショット
- **リアルタイム駐車状態（currentParked / parking_history）** → 気配（lastVerifiedAt）のみ
- **LiveFeed / お気に入り（ハート） / 出発ボタン / 日記タイムライン** → ワンショット + ライダーノートに統合
- **CCフィルタトグル** → チュートリアルで選択、常時ON
- **MyBikeScreen** → RiderScreen内に集約
- **GlassBreakEffect / マーカー脈動 / ピルバー（NearbySpotsList）** → クリーンマップ＋5タブ集約

### 未着手・保留の予定機能

| 機能 | 優先度 | 状態 |
|------|--------|------|
| コールドスタート対策 | P1 | **未着手（#180）** — 「知ってるのにない」離脱防止。最寄り距離表示 + チュートリアル後ツールチップ |
| 看板OCR | P1 | **保留** — コスト考慮。管理画面で人力入力に変更 |

---

## 技術的負債（リファクタリング）

| Issue | 内容 | 状態 |
|-------|------|------|
| #94 | アクセシビリティラベル追加（WCAG 2.1 AA） | 未完了（P2） |

---

## スポットデータ

**Firestore 合計: 約1,306件**（首都圏 + 関東広域）

### データソース

| ソース | 件数 | IDプレフィクス | ライセンス | 内容 |
|--------|------|---------------|-----------|------|
| **実在確認済み** | 41件 | `real_` | — | 公式サイト・現地確認ベースの駐車場。住所・料金・台数・営業時間あり |
| **JMPSA公開情報** | 38件 | `jmpsa_` | — | 日本二輪車普及安全協会（https://www.jmpsa.or.jp/society/parking/）の公開データから手動転記。渋谷・新宿・千代田・豊島・港・中央区 |
| **OpenStreetMap** | 675件 | `osm_` | **ODbL** | Overpass API から `amenity=motorcycle_parking` を自動取得。名前あり23%、台数あり13%。ユーザーの足跡で情報が育つ設計 |
| **警察ガイド** | 552件 | `police_` | — | 都内オートバイ駐車場MAP 2024（東京都道路整備保全公社発行）。全件に名称・住所・台数・料金・IC決済。CC制限・営業時間もnotesから自動パース。OSM重複34件はマージ更新済み |

### OSM データ詳細

- **取得範囲:** 緯度 34.8〜36.9、経度 138.5〜140.9（東京・神奈川・埼玉・千葉 + 茨城・栃木・群馬・静岡・山梨・長野）
- **取得方法:** Overpass API（`node` + `way` の `amenity=motorcycle_parking`）
- **取得スクリプト:** `scripts/fetchOsmSpots.mjs`
- **重複排除:** 既存 real_/jmpsa_ スポットと50m以内の座標は自動除外
- **ライセンス義務:** アプリ内に `© OpenStreetMap contributors` のクレジット表記が必要（SettingsScreen に追加済み）
- **ODbL 条件:** 商用利用OK。OSMデータを含むデータベースを外部APIで公開する場合は同一ライセンス適用が必要
- **データ品質:** 名前・住所が空のスポットが多い。ユーザーが足跡を残す中で情報が補完されていく想定

### エリア別内訳（OSM分）

| エリア | 件数 |
|--------|------|
| 東京都 | 379 |
| 神奈川県 | 133 |
| 埼玉県 | 56 |
| 千葉県 | 45 |
| 茨城県 | 18 |
| 静岡県 | 17 |
| 山梨県 | 11 |
| 栃木県 | 8 |
| 群馬県 | 5 |
| 長野県 | 2 |

### 投入スクリプト

| スクリプト | 用途 | 実行コマンド |
|-----------|------|-------------|
| `scripts/fetchOsmSpots.mjs` | OSM から首都圏データ取得 → JSON 出力 | `node scripts/fetchOsmSpots.mjs` |
| `scripts/importRealData.mjs` | 実在79件の投入（ダミー削除 + 実データ投入） | `node scripts/importRealData.mjs` |
| `scripts/bulkImport.mjs` | 汎用 JSON → Firestore バッチ書き込み | `node scripts/bulkImport.mjs --file scripts/data/spots-osm-kanto.json` |
| `scripts/importPoliceGuide.mjs` | 警察ガイド588件 → 重複チェック + Firestore投入 | `node scripts/importPoliceGuide.mjs --dry-run` |
| `scripts/generateSpots.mjs` | ダミーデータ生成（開発用、本番非使用） | `node scripts/generateSpots.mjs` |

### データ拡充ロードマップ（都市集中戦略）

**方針:** 地方にデータを薄く広げない。都市部のデータ密度を上げ、「開けば必ず見つかる」体験を保証する。拡張は都市間横展開。

| Phase | ソース | 想定件数 | 状態 |
|-------|--------|---------|------|
| ~~Phase 0~~ | ~~実在確認 + JMPSA手動転記~~ | ~~79件~~ | **完了** |
| ~~Phase 1~~ | ~~OpenStreetMap（Overpass API）~~ | ~~675件~~ | **完了（2026-04-14）** |
| ~~Phase 1.5~~ | ~~警察配布バイク駐車場ガイド（PDFスキャン→OCR）~~ | ~~552件~~ | **完了（2026-04-17）** — 588件OCR→ジオコーディング→552件新規投入+34件OSMマージ |
| Phase 2 | 横浜市・川崎市・さいたま市の自治体オープンデータ（CC BY 4.0） | 数百件 | 未着手 — 東京23区は警察ガイドで充足。次は周辺政令指定都市の密度を上げる |
| Phase 3 | s-park（東京都道路整備保全公社）提携 | 580場 | 未着手 — 二輪駐車場 + リアルタイム満空情報。β反響次第で交渉開始 |
| Phase 4 | JMPSA 正式データ提携 | 15,300件（首都圏） | 未着手 — akippa前例あり。β反響次第で交渉開始 |
| Phase 5 | 大阪・名古屋・福岡へ都市間横展開 | 数千件 | 未着手 — 首都圏で勝ってから |

---

## ブランドボイス（コミュニケーション指針）

- ライダー同士の「気配」で語る。強い繋がりは強要しない。対向車線でのヤエー（ピースサイン）の距離感
- 「報告してください」とは言わない。「ここにいたよ、を残そう」
- 機能説明より「存在の実感」を描写する（例：「ボタンを押す」ではなく「足跡を刻む」）
- 比較広告的な表現は避ける。自分たちの世界観で語る
- Googleマップとの差別化: データの正確さではなく「ユーザーの匂い」「体温のある情報」
- **「駐車場マップ」と言わない。ワンショットが足跡を刻む。足跡が誰かの地図になる。** 機能ではなく行為と結果を語る
- 都市ライダーの身体的ストレス（重い車体を支えながらスマホ、一方通行をぐるぐる、ヘルメットの中の汗）に共感する言葉を選ぶ
- 「全国対応」を謳わない。首都圏で深く刺さることを誇る
