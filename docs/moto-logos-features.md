# Moto-Logos 機能仕様詳細

星図・気配・足跡・セレモニー・Sentry・βフィードバック・チュートリアル等の実装詳細。
CLAUDE.md から「該当機能を変更する時」に参照される。

判断軸（UX規則・設計思想）は CLAUDE.md 側に残している。ここは仕様の詳細。

---

## 写真アップロード（Firebase Storage）

- レビュー写真は Firebase Storage にアップロードし、公開 URL を Firestore `reviews.photoUrls` に保存
- アップロード前に `expo-image-manipulator` で圧縮（max 1024px, JPEG quality 0.7）
- Storage パス: `reviews/{spotId}/{userId}_{timestamp}.jpg`
- アップロード中はプログレスバーを表示
- ローカル URI を直接 Firestore に保存しない

---

## 画像表示（expo-image）

- RN 標準 `Image` は使わない。全画像表示に `expo-image` の `Image` を使用（ディスクキャッシュ + ネイティブデコード）
- `source` は文字列 URI を直接渡す（`source={uri}` / `{{ uri }}` 形式は不要）
- サムネイル表示には `transition={200}` でフェードイン + `cachePolicy="disk"` を指定
- `resizeMode` ではなく `contentFit` を使う（expo-image の API）
- RiderScreen のワンショットグリッドは `FlatList` + `numColumns={3}` で仮想化（`.map()` で全件レンダーしない）
- SpotDetailSheet のギャラリー FlatList には `initialNumToRender` / `maxToRenderPerBatch` / `removeClippedSubviews` / `getItemLayout` を必ず指定

---

## 星図（Star Map）

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

---

## 足跡システム（実装詳細）

設計思想（「報告」概念の排除、利己→結果的利他）は CLAUDE.md 参照。ここは実装仕様。

### 停められた場合（足跡を残す）

- 📸 ワンショット撮影 — 写真1枚でライダーノートに保存 + スポット鮮度が副産物として更新
- 完了 → **ワンショットセレモニー演出**（後述）→ 鮮度（lastVerifiedAt）更新 + 駐車履歴に記録
- AsyncStorage `vote_{spotId}` で重複防止
- データは Firestore reviews コレクションに保存（score: 1=停められた）

### ワンショットセレモニー演出（#175）

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

### 「停められなかった」フロー（廃止）

- ワンショットの世界に「失敗」はない。「いた」か「撮らなかった」かだけ
- 既存のscore=0データは足跡として静かに残すが、新規UIは削除済み

### 廃止・削除対象

- 旧星レビュー（score 2-5）の後方互換表示 → 完全削除
- 「報告」という用語 → 「足跡」「メモ」に統一

---

## 気配システム（地図ピン）— 実装詳細

設計思想（live のみグロー、silent は中空リング、selected pin との色相分離）は CLAUDE.md 参照。

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

---

## 足跡タイプカラー（活動タイムライン）

| 足跡タイプ | 色 | アイコン | 意味 |
|-----------|-----|---------|------|
| 停められた | 緑 `#30D158` | thumbs-up | ここにいた |
| 満車 | 赤 `#FF453A` | alert-circle | 停められなかった |
| 閉鎖 | 濃グレー `#636366` | close-circle | 閉まっていた |
| 料金違う | 黄 `#FFD60A` | cash-outline | 情報と違った |
| CC制限違う | オレンジ `#FF9F0A` | speedometer-outline | 入れなかった |
| 新規発見 | 紫 `#BF5AF2` | location | 新しい場所を見つけた |

- RiderScreen活動タイムライン: ドット色で色分け（labelテキストから`getReportSubtype()`で自動判定）

---

## レビューのバイク車種名紐づけ

- `addReview()` に `vehicleName` 引数追加 → Firestore reviews に保存
- 呼び出し元で `getFirstVehicle()` から車種名を取得して渡す
- SpotDetailSheet の ReportCard に「{車種名} で記録」表示（旧: 「で報告」）
- チュートリアルのダミーレビューに車種名付き

---

## アクティビティログ

- SQLite `activity_log` テーブルでアクション履歴を記録
- 種別: `spot`（スポット登録）/ `review`（口コミ投稿）/ `report`（確認報告）
- RiderScreen のタイムラインに実データ表示（相対時刻付き）

---

## デバッグ Alert スイッチ（DEBUG_ALERT）

調査用に画面に Alert を出すデバッグ機構を `src/utils/debug.ts` に集約。**β配布前は必ず `DEBUG_ALERT = false`**。

- 影響範囲:
  - `MapScreen.tsx`: fetchSpotsInRegion の結果 / エラーを Alert（0件問題の調査用）
  - `SearchOverlay.tsx`: chipPress のエラー詳細を Alert（Places API 調査用）
- 通常の Alert（位置情報拒否・検索失敗など）は DEBUG_ALERT に依存しない常時表示
- 個別フラグではなく単一スイッチに統一（過去事例: 2026-04-20 に SearchOverlay へ仕込んだまま CEO がβ実機で遭遇 → 一括制御に変更）

---

## クラッシュ監視（Sentry）

- Sentry（`@sentry/react-native ~7.2.0`）を使用（Expo managed workflow 対応）
- **Organization:** `moto-logos-team` / **Project:** `moto-logos`
- `App.tsx` で `initSentry()` + `sentryWrap()` で自動キャプチャ
- `ErrorBoundary` コンポーネントで React レンダーエラーをキャッチ
- `captureError()` で try-catch 内の手動エラー送信（全 Firestore 操作・レポート送信に適用済み）
- `setSentryUser()` でニックネーム設定時にユーザーコンテキストをセット
- DSN 未設定時はサイレントスキップ（開発時の安全策）
- 本番: `tracesSampleRate: 0.2`（パフォーマンス計測20%サンプリング）

---

## βフィードバック基盤

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

---

## NGワードフィルタ

- `src/utils/ng-filter.ts` でクライアント側フィルタ（即時フィードバック用）
- サーバー側は管理ダッシュボード API で本格的なチェック
- ひらがな/カタカナ正規化対応

---

## インタラクティブガイドツアー（ソシャゲ式チュートリアル）

設計思想（実際のUIをタップさせて覚えさせる）は CLAUDE.md 参照。ここは実装詳細。

初回起動時 / 設定画面から再開可能。

**アーキテクチャ:**
- `TutorialContext` (`src/contexts/TutorialContext.tsx`): 全ステップ定義 + 状態管理 + ダミースポット
- `TutorialOverlay` (`src/components/TutorialOverlay.tsx`): セットアップ画面 + 完了画面
- `TutorialGuide` (`src/components/TutorialGuide.tsx`): スポットライト（4矩形暗幕）+ パルスグロー + 指示テキスト

**フロー（22ステップ — CEO仕様v3準拠、全ステップがユーザータップで進行）:**

| # | ステップ | 内容 |
|---|---------|------|
| A | setup | CC選択（footstepsアイコン +「ワンショットが足跡になる。足跡が誰かの地図になる。」） |
| B-0 | scene-explore | シーンカード「バイク置き場を探す」 |
| B-1 | explore-nearby | 周辺検索FABタップ → 東京駅ダミー3件表示 |
| B-2 | explore-result | 結果カードタップ → スポット詳細表示 |
| B-3 | explore-nav | ナビボタンタップ |
| B-4 | explore-nav-confirm | モックナビモーダル（Googleマップ/住所コピー）+ テキスト |
| B-5 | explore-banner | 案内バナー + ピンオレンジ表示（動的測定でバナー枠を合わせる） |
| C-0 | scene-arrive | シーンカード「到着したら」 |
| C-1 | arrive-notify-explain | 「500m圏内に入ると通知が届きます」 |
| C-2 | arrive-notify | モック通知カード（タップで次へ） |
| C-3 | arrive-oneshot | ワンショットボタンタップ → ダミーセレモニー発火 |
| C-4a | arrive-ceremony | OneshotCeremony演出 → 完了で markDummyConfirmed() |
| C-4b | arrive-result | スポットカード再表示で気配色変更を実物で見せる（cold→live） |
| C-5 | arrive-ai | 「看板などをワンショットすると自動で情報が更新されます」 |
| D-0 | scene-newspot | シーンカード「新しいスポットの登録」 |
| D-1 | newspot-explain | ＋ボタンの説明（フッターモック付き） |
| D-2 | newspot-prompt | 「実際にやってみましょう」 |
| D-3a | newspot-do | ＋ボタンスポットライト → タップで handleQuickReport インターセプト |
| D-3b | newspot-ceremony | セレモニー演出（tutorial-bike.jpg） |
| E-0 | scene-presence | シーンカード「スポットの『気配』」 |
| E-1 | presence-intro | 6段階カラーパネル（live〜silent、スタッガーフェードイン） |
| F | complete | 「さあはじめよう！」オレンジボタン #FF6B00 |

**ダミーデータ:**
- スポット: 東京駅八重洲口バイク駐車場（`_tutorial_spot_`、初期cold状態）+ 周辺2件
- 写真: `assets/tutorial-bike.jpg`（D-3セレモニー用）、`assets/tutorial-parking.jpg`（C-3セレモニー用）
- DUMMY_SPOTは初期cold（200日前）→ C-4で `markDummyConfirmed()` により live に変化
- ステップ切替時に `targets.current = {}` でクリア（render中実行、スポットライト先出し防止）
- complete画面: TutorialGuide暗幕をフェードアウトせず維持（チラつき防止）
- finishTutorialのsetTimeoutをstartTutorialでキャンセル（再開バグ防止）
- Firestoreへの書き込みなし（チュートリアル中は全インターセプト）

**チュートリアル終了後:** ダミーデータ削除、GPS現在地にマップ移動、周辺スポット自動フェッチ
