# Moto-Logos 管理機能要件定義書

**作成者:** Michael (Market Research)
**作成日:** 2026-04-12
**対象:** Moto-Logos v2 管理ダッシュボード及びバックエンド運用機能
**ステータス:** 調査完了 / レビュー待ち

---

## 調査概要

コミュニティ駆動型UGCアプリの管理機能について、以下の先行事例を調査し要件を策定した。

| 調査対象 | 関連領域 |
|----------|----------|
| Waze | エディタ階層制度・段階的権限昇格・地理データの品質管理 |
| PlugShare | クラウドソーシング型チャージャーマップ・データ整合性チーム・PlugScore信頼性評価 |
| Wikipedia | 編集パトロール・自動荒らし検知(ClueBot_NG/ORES)・段階的権限モデル |
| Reddit | AutoModerator・Crowd Control・モデレーションキュー・Mod Log |
| OpenStreetMap | 重複POI検出(Osmose)・品質保証ツール(KeepRight)・MapRoulette |

---

## 1. コンテンツモデレーション

### 1.1 モデレーションキュー [P0]

**現状の課題:** `badReportCount >= 3` で status が "pending" に遷移するロジックは実装済みだが、pending スポットを審査・復旧する管理UIが存在しない。

**要件:**

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| MOD-01 | pending 状態のスポット一覧を表示するモデレーションダッシュボード | P0 | Redditのモデレーションキュー方式。ローンチ時に pending スポットが溜まると復旧不能になる |
| MOD-02 | スポットの承認(active復帰)/却下(closed)/削除の3アクション | P0 | Waze: Level2+エディタの承認フロー準拠 |
| MOD-03 | レビュー(口コミ)の通報機能及び通報済みレビュー一覧 | P0 | Google Play UGCポリシー: 不適切コンテンツの報告・ブロック機能はストア審査必須要件 |
| MOD-04 | 写真コンテンツの目視確認キュー | P1 | PlugShareのデータ整合性チーム方式。初期は手動レビュー、規模拡大後にAI導入 |
| MOD-05 | スポット編集履歴(変更ログ)の記録と閲覧 | P1 | Wikipedia: 全編集履歴を保持し、差分比較が可能。不正編集の追跡に必須 |

### 1.2 自動モデレーション [P1]

**調査結果:** Reddit AutoModeratorは投稿の82%を自動レビューし、8%に対してアクションを取る。Wikipedia AutoModeratorはMLモデルでバンダリズムを自動リバート。初期フェーズでは手動レビューで十分だが、日次投稿100件超で自動化が必要になる(WebPurify/UGCモデレーション業界標準)。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| MOD-06 | スポット名・レビューコメントのNGワードフィルタ | P1 | Reddit AutoMod方式。YAML/JSON定義のルールベース |
| MOD-07 | 短時間での大量投稿検知(スパム防止) | P1 | 同一ユーザーが5分以内に10件以上投稿 = スパム疑い |
| MOD-08 | 写真の不適切コンテンツ自動検知(NSFW) | P2 | Google Cloud Vision API / Firebase ML Kit。規模拡大後に導入 |
| MOD-09 | 重複スポットの自動検知(半径50m以内の同名スポット) | P1 | OpenStreetMap Osmose方式。geohash近接検索で実装可能 |

### 1.3 コミュニティガイドライン [P0]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| MOD-10 | アプリ内に表示するコミュニティガイドライン(利用規約) | P0 | Google Play UGCポリシー必須要件: ユーザーが利用規約に同意しない限りUGC投稿不可 |
| MOD-11 | ガイドライン違反時の段階的処分ポリシーの策定 | P0 | Waze: 頻度と深刻度に応じた一時/永久停止ポリシー |

---

## 2. ユーザー管理

### 2.1 信頼スコア・ランクシステムの拡張 [P0/P1]

**現状:** `FirestoreUser` に `trustScore`(初期100) と `rank`(novice/rider/patrol) が定義済み。Good +10 / Bad -20 のスコア変動ロジックあり。

**調査結果(Waze階層制度):**
- L1(初心者): 投稿に承認が必要
- L2-L3: 自動昇格(正確な編集数に基づく)
- L4+: 手動任命(Area Manager, Country Manager)
- 10回の承認後「信頼エディタ」に昇格 → 投稿が即時反映

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| USR-01 | ユーザー一覧・検索・詳細表示(投稿履歴、スコア推移) | P0 | 不正ユーザー特定に必須 |
| USR-02 | ユーザーの手動BAN(一時停止/永久停止) | P0 | 全コミュニティアプリ共通の基本機能 |
| USR-03 | BAN解除申請(アピール)フロー | P1 | Waze/Reddit: 不当BANへの救済措置。信頼性向上に寄与 |
| USR-04 | patrol ランクへの手動昇格/降格 | P1 | Waze: L4+ は手動任命。コミュニティリーダーの育成 |
| USR-05 | trustScore の管理者による手動調整 | P1 | 不正操作されたスコアの是正用 |
| USR-06 | ユーザー行動ログ(投稿/投票/通報の履歴) | P1 | Reddit Mod Notes / User Mod Log 方式 |

### 2.2 不正ユーザー検知 [P1]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| USR-07 | 複数アカウント検知(同一デバイスID/IP) | P1 | 自作自演(good投票の水増し)防止 |
| USR-08 | 異常行動パターン検知(短時間大量bad報告等) | P1 | ActiveFence方式: プロアクティブな脅威検知 |
| USR-09 | BAN回避検知 | P2 | Reddit Ban Evasion Filter 相当 |

### 2.3 ゲーミフィケーション管理 [P2]

**調査結果:** ゲーミフィケーション要素(ポイント/バッジ/リーダーボード)はコミュニティ参加率を大幅に向上させる。Waze は編集数に基づく自動レベルアップで参加を促進。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| USR-10 | バッジ定義の管理(例: 「初投稿」「10スポット登録」「パトロール隊長」) | P2 | Waze/PlugShare: 貢献に応じたバッジ付与 |
| USR-11 | 週間/月間貢献者ランキング | P2 | 毎週リセットされるリーダーボードで新規ユーザーも参加可能 |
| USR-12 | 貢献ポイント付与ルールの管理画面 | P2 | ポイント付与条件を柔軟に調整可能にする |

---

## 3. データ品質管理

### 3.1 鮮度管理 [P0]

**現状:** `updatedAt` フィールドで鮮度可視化ロジックあり(1ヶ月=青, 3ヶ月=黄, 6ヶ月+=赤)。ただし古いデータを自動処理する仕組みがない。

**調査結果:** OpenStreetMapでは都市部で2-3ヶ月、地方で6-12ヶ月のデータ更新サイクル。Firestore TTLポリシーで自動削除可能。Firebase Cloud Functions のスケジュール実行でバッチ処理可能。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| DQ-01 | 鮮度アラートダッシュボード(6ヶ月以上未更新スポット一覧) | P0 | 古いデータは駐輪場の閉鎖・移転を反映できず、ユーザー体験を著しく損なう |
| DQ-02 | 6ヶ月以上未更新スポットの自動 pending 遷移(Cloud Functions cron) | P1 | Firestore スケジュール実行。毎日深夜に実行 |
| DQ-03 | ユーザーへの「このスポットはまだありますか?」確認プッシュ通知 | P1 | PlugShare方式: ユーザー参加型の鮮度維持 |
| DQ-04 | 12ヶ月以上未更新 + goodCount=0 のスポットの自動アーカイブ | P2 | 死データの蓄積防止 |

### 3.2 重複・精度管理 [P1]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| DQ-05 | 重複候補スポットの検出(geohash近接 + 名称類似度) | P1 | OpenStreetMap Osmose 方式。半径50m以内かつ名称レーベンシュタイン距離 < 3 |
| DQ-06 | 重複スポットのマージ機能(投票・レビューの統合) | P1 | マージ時に goodCount/reviewCount を合算 |
| DQ-07 | スポット位置座標の手動修正機能 | P0 | ユーザー投稿の座標誤差是正。管理画面の地図上でピンをドラッグ |
| DQ-08 | 一括データインポート/エクスポート(CSV/JSON) | P1 | シードデータ更新・バックアップ・外部連携用 |

### 3.3 検証ワークフロー [P1]

**調査結果(Waze信頼エディタ制度):** L1エディタの投稿は L2+ の承認が必要。10回の承認で「信頼エディタ」に昇格し、以降は即時反映。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| DQ-09 | novice ランクユーザーの新規スポット投稿を pending で保持 | P1 | Waze L1 エディタ方式。信頼獲得まで承認制 |
| DQ-10 | patrol ランクユーザーの投稿を即時 active 反映 | P1 | Waze 信頼エディタ方式。高信頼ユーザーの投稿フロー簡略化 |
| DQ-11 | verificationLevel "official" の手動付与(公式提携店舗用) | P0 | 公式バッジの信頼性担保。管理者のみ付与可能 |

---

## 4. KPI・アナリティクス

### 4.1 コアメトリクス [P1]

**調査結果:** DAU/MAU比率 20%以上がB2Bアプリで良好、コンシューマーアプリでは50%以上が目標。日本のアプリの30日リテンション率は約6%。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| KPI-01 | DAU / WAU / MAU トラッキング | P1 | Firebase Analytics で基本取得可能。ダッシュボード表示が必要 |
| KPI-02 | DAU/MAU 比率(スティッキネス) | P1 | 目標: 20%以上 |
| KPI-03 | セッション時間・セッション頻度 | P1 | ユーザーエンゲージメント指標 |
| KPI-04 | Day 1 / Day 7 / Day 30 リテンション率 | P1 | 日本市場ベンチマーク: D1=25%, D7=10.7%, D30=6% |

### 4.2 コミュニティ健全性メトリクス [P1]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| KPI-05 | 投稿率(日次新規スポット数 / DAU) | P1 | コミュニティの活発度指標 |
| KPI-06 | 検証率(日次 good/bad 投票数 / DAU) | P1 | 相互監視システムの機能状況 |
| KPI-07 | データ鮮度分布(青/黄/赤の割合推移) | P1 | データ品質のマクロ指標 |
| KPI-08 | 地理的カバレッジ(区市町村別スポット密度) | P1 | 展開エリアの成熟度判定 |
| KPI-09 | ランク別ユーザー分布(novice/rider/patrol) | P1 | コミュニティの信頼層構造の可視化 |
| KPI-10 | モデレーションキュー処理時間(pending → 解決の平均日数) | P1 | 運用効率の指標 |

### 4.3 ビジネスメトリクス [P2]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| KPI-11 | 検索→閲覧→ナビ遷移のコンバージョンファネル | P2 | ユーザー行動の深層分析 |
| KPI-12 | エリア別ユーザー密度ヒートマップ | P2 | 新規エリア展開の優先度判定 |
| KPI-13 | レビュー投稿率・写真添付率 | P2 | UGCの質的向上の追跡 |

---

## 5. 法務・コンプライアンス

### 5.1 情報流通プラットフォーム対処法(旧プロバイダ責任制限法)対応 [P0]

**調査結果:**
- 2025年4月施行の改正法(情報流通プラットフォーム対処法)により、「大規模特定電気通信役務提供者」(月間国内発信者1,000万以上)には削除基準の策定・公表、対応状況の透明化が義務化。
- Moto-Logosは現時点で大規模事業者の要件に該当しないが、**全てのプロバイダに共通する基本義務**(権利侵害情報の送信防止措置)は適用される。
- 将来の成長に備え、大規模事業者要件を意識した設計が推奨。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| LEG-01 | 権利侵害申出への対応フロー(削除依頼受付→審査→対応→通知) | P0 | プロバイダ責任制限法: 全プロバイダ共通義務 |
| LEG-02 | 送信防止措置(コンテンツ削除)のログ記録 | P0 | 法的紛争時の証拠保全 |
| LEG-03 | 利用規約・プライバシーポリシーのアプリ内表示と同意取得 | P0 | Google Play UGCポリシー必須要件 |
| LEG-04 | 削除依頼対応窓口(メールアドレスまたはフォーム)の公開 | P0 | 情報流通プラットフォーム対処法: 日本語での申請を可能にすること |

### 5.2 個人情報保護法対応 [P0]

**調査結果:** 位置情報は個人を特定可能な情報と紐付けられた場合、個人情報保護法の適用対象。2025年改正で規制強化の方向。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| LEG-05 | 個人情報取得項目の明示(位置情報・デバイス情報等) | P0 | 個人情報保護法・電気通信事業ガイドライン |
| LEG-06 | 位置情報取得時のオプトイン同意 | P0 | OS標準の位置情報許可に加え、利用目的の明示 |
| LEG-07 | ユーザーデータ削除リクエスト対応(アカウント削除) | P0 | 個人情報保護法: 本人の求めに応じた利用停止・消去 |
| LEG-08 | 個人データの第三者提供時の同意取得 | P1 | 将来的なデータ連携・広告導入時に必要 |

### 5.3 Google Play / App Store ポリシー [P0]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| LEG-09 | アプリ内通報機能(不適切コンテンツ・ユーザーの報告) | P0 | Google Play UGCポリシー必須: "不適切なUGCやユーザーについて報告してブロックするためのアプリ内システム" |
| LEG-10 | ユーザーブロック機能 | P0 | Google Play UGCポリシー必須要件 |
| LEG-11 | UGCモデレーション実施体制の文書化 | P0 | ストア審査時の説明資料として |

---

## 6. 運用ツール

### 6.1 プッシュ通知管理 [P1]

**調査結果:** Firebase Cloud Messaging で最大500件/バッチの一括送信が可能。Topic ベースのサブスクリプションでセグメント配信が効率的。

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| OPS-01 | 全ユーザー向け一斉通知(メンテナンス・重要告知) | P1 | FCM Topic messaging |
| OPS-02 | エリア別セグメント通知(新スポット追加時の周辺ユーザー通知) | P1 | geohash ベースのエリアセグメント |
| OPS-03 | 個別ユーザーへの通知(BAN通知、アピール結果等) | P0 | BAN/処分時の通知は法的にも運用的にも必須 |
| OPS-04 | 通知テンプレート管理 | P2 | 定型文の再利用 |
| OPS-05 | 予約配信(スケジュール送信) | P2 | Firebase Cloud Tasksで実装可能 |

### 6.2 データ運用 [P1]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| OPS-06 | スポットの一括ステータス変更(エリア単位での閉鎖等) | P1 | 災害時・大規模イベント時の緊急対応 |
| OPS-07 | Firestore データのバックアップ・リストア手順 | P0 | 障害復旧。Firebase の自動バックアップ設定 |
| OPS-08 | シードデータの一括更新(CSV/JSONインポート) | P1 | 新エリア展開時のデータ投入 |
| OPS-09 | Firestore セキュリティルールの定期監査 | P1 | 不正アクセス防止 |
| OPS-10 | エラーログ・クラッシュレポートの監視(Crashlytics) | P0 | アプリ品質の維持 |

### 6.3 管理ダッシュボード [P0]

| ID | 要件 | 優先度 | 根拠 |
|----|------|--------|------|
| OPS-11 | Web ベースの管理ダッシュボード(React / Next.js + Firebase Admin SDK) | P0 | FireCMS またはカスタム実装。Firestore コンソールだけでは運用不可 |
| OPS-12 | 管理者ロール(スーパー管理者/モデレーター/閲覧者) | P0 | 権限分離。Firebase Auth Custom Claims で実装 |
| OPS-13 | 管理操作の監査ログ(誰が何をいつ実行したか) | P0 | Reddit Mod Log 方式。コンプライアンス要件 |

---

## 実装優先度サマリー

### P0 (ローンチブロッカー) - 14件

ストアリリースまでに必須。法的義務またはストアポリシー違反によるリジェクトリスク。

| カテゴリ | ID | 概要 |
|----------|----|------|
| モデレーション | MOD-01 | pending スポット管理ダッシュボード |
| モデレーション | MOD-02 | スポット承認/却下/削除アクション |
| モデレーション | MOD-03 | レビュー通報機能+通報一覧 |
| モデレーション | MOD-10 | コミュニティガイドライン |
| モデレーション | MOD-11 | 段階的処分ポリシー |
| ユーザー管理 | USR-01 | ユーザー一覧・検索・詳細 |
| ユーザー管理 | USR-02 | ユーザーBAN |
| データ品質 | DQ-01 | 鮮度アラートダッシュボード |
| データ品質 | DQ-07 | スポット座標の手動修正 |
| データ品質 | DQ-11 | official バッジの手動付与 |
| 法務 | LEG-01〜04 | 法的対応フロー・利用規約・削除窓口 |
| 法務 | LEG-05〜07 | 個人情報保護法対応 |
| 法務 | LEG-09〜11 | ストアポリシー対応(通報/ブロック/文書化) |
| 運用 | OPS-03 | 個別ユーザー通知 |
| 運用 | OPS-07 | データバックアップ |
| 運用 | OPS-10 | クラッシュレポート監視 |
| 運用 | OPS-11〜13 | 管理ダッシュボード本体・ロール・監査ログ |

### P1 (ローンチ後3ヶ月以内) - 25件

コミュニティ成長に伴い必要性が急増する機能。

| カテゴリ | 主な項目 |
|----------|----------|
| モデレーション | 写真レビューキュー、編集履歴、NGワードフィルタ、スパム検知、重複検知 |
| ユーザー管理 | BAN解除申請、patrol手動昇格、スコア調整、行動ログ、不正検知 |
| データ品質 | 自動pending遷移、鮮度確認通知、重複マージ、データインポート/エクスポート、検証ワークフロー |
| KPI | DAU/MAU、リテンション、投稿率、鮮度分布、カバレッジ、モデレーション処理時間 |
| 法務 | 第三者提供同意 |
| 運用 | 全体通知、エリア通知、一括ステータス変更、セキュリティ監査 |

### P2 (6ヶ月以降) - 12件

規模拡大・成熟フェーズで価値が顕在化する機能。

| カテゴリ | 主な項目 |
|----------|----------|
| モデレーション | NSFW自動検知 |
| ユーザー管理 | BAN回避検知、バッジ管理、ランキング、ポイントルール管理 |
| データ品質 | 自動アーカイブ |
| KPI | コンバージョンファネル、ヒートマップ、レビュー投稿率分析 |
| 運用 | 通知テンプレート、予約配信 |

---

## Firestore スキーマ拡張案

現行スキーマ(`firestoreTypes.ts`)に対する追加コレクション/フィールドの提案。

### 新規コレクション

```
reports/{reportId}
  - targetType: 'spot' | 'review' | 'user'
  - targetId: string
  - reporterId: string
  - reason: 'spam' | 'inaccurate' | 'offensive' | 'duplicate' | 'other'
  - description?: string
  - status: 'open' | 'reviewing' | 'resolved' | 'dismissed'
  - resolvedBy?: string
  - resolvedAt?: Timestamp
  - createdAt: Timestamp

moderation_logs/{logId}
  - adminId: string
  - action: 'approve' | 'reject' | 'delete' | 'ban' | 'unban' | 'edit' | 'merge'
  - targetType: 'spot' | 'review' | 'user'
  - targetId: string
  - reason?: string
  - previousState?: object
  - newState?: object
  - createdAt: Timestamp

announcements/{announcementId}
  - title: string
  - body: string
  - targetSegment: 'all' | 'area' | 'rank'
  - targetFilter?: object
  - scheduledAt?: Timestamp
  - sentAt?: Timestamp
  - status: 'draft' | 'scheduled' | 'sent'
  - createdBy: string
  - createdAt: Timestamp
```

### 既存コレクションへの追加フィールド

```
users/{userId}
  + isBanned: boolean
  + banReason?: string
  + bannedAt?: Timestamp
  + bannedBy?: string
  + banExpiresAt?: Timestamp  // null = 永久BAN
  + role: 'user' | 'moderator' | 'admin'
  + badges: string[]
  + contributionPoints: number
  + lastActiveAt: Timestamp

spots/{spotId}
  + editHistory: Array<{
      editedBy: string,
      editedAt: Timestamp,
      changes: object
    }>
  + mergedFrom?: string[]  // マージ元スポットID
  + archivedAt?: Timestamp
```

---

## 技術実装方針(Andy向け提案)

| 項目 | 推奨技術 | 理由 |
|------|----------|------|
| 管理ダッシュボード | Next.js + Firebase Admin SDK | SSR対応、Vercelデプロイ、Firebase との親和性 |
| 代替案 | FireCMS (OSS) | Firestoreネイティブ CMS。カスタマイズ性とセットアップ速度のバランス |
| スケジュールバッチ | Firebase Cloud Functions (onSchedule) | 鮮度チェック・自動pending遷移・統計集計のcronジョブ |
| プッシュ通知 | Firebase Cloud Messaging (FCM) | 既存Firebase基盤との統合。Topic/条件付き配信 |
| 画像モデレーション | Google Cloud Vision API | Firebase連携済み。NSFW/暴力コンテンツの自動検知 |
| アナリティクス | Firebase Analytics + BigQuery Export | 詳細分析はBigQueryで。ダッシュボードはLooker Studio |
| 監視 | Firebase Crashlytics + Cloud Monitoring | クラッシュレポート + パフォーマンス監視 |

---

## 競合比較表

| 機能 | Waze | PlugShare | Wikipedia | Reddit | Moto-Logos(現状) | Moto-Logos(目標) |
|------|------|-----------|-----------|--------|-----------------|-----------------|
| エディタ階層 | L1-L6 + CM/AM | なし | 自動確認/管理者 | カルマ制 | novice/rider/patrol | 左記 + moderator/admin |
| 投稿承認制 | L1のみ承認制 | なし | 新規ユーザーのみ | SubredditごとにAutoMod設定 | なし | novice のみ承認制 |
| 自動モデレーション | Place承認フロー | データ整合性チーム | ClueBot_NG/ORES | AutoModerator | badReport >= 3 | NGワード + スパム検知 |
| 不正検知 | アカウント停止 | 不明 | CheckUser | Ban Evasion Filter | なし | デバイスID + 行動パターン |
| データ鮮度管理 | 活発な編集コミュニティ | PlugScore + チェックイン | 編集履歴 + 論争タグ | なし(フロー型) | updatedAt 可視化のみ | 自動pending + 確認通知 |
| 管理ダッシュボード | WME(Web Map Editor) | 管理画面あり | MediaWiki管理画面 | Mod Tools Hub | なし | Web管理ダッシュボード |

---

## 次のアクション

1. **CEOレビュー:** P0要件の優先順位確認と予算承認
2. **Andy(Engineering):** 管理ダッシュボードの技術設計開始。Firestoreスキーマ拡張のレビュー
3. **Becky(Communications):** コミュニティガイドライン・利用規約の日本語ドラフト作成
4. **Solo(Operations):** P0→P1→P2 のリリースロードマップ策定
5. **Anna(Product Design):** 管理ダッシュボードのUI/UXデザイン

---

## 調査出典

- [Waze Content Moderation and Appeals](https://support.google.com/waze/answer/14600409?hl=en-GB)
- [Waze Editor Levels](https://www.waze.com/discuss/t/editing-levels/375451)
- [Waze Editing Restrictions](https://wazeopedia.waze.com/wiki/Global/Editing_restrictions)
- [PlugShare Key Features](https://help.plugshare.com/hc/en-us/articles/6002928858643-PlugShare-Key-Features)
- [PlugShare Data Integrity](https://company.plugshare.com/data.html)
- [Wikipedia Anti-Vandalism Design](https://design.wikimedia.org/blog/2020/07/30/content-moderation-anti-vandalism-wikipedia.html)
- [Wikipedia Automoderator](https://en.wikipedia.org/wiki/Wikipedia:Moderator_Tools/Automoderator)
- [Reddit Moderation Tools Overview](https://support.reddithelp.com/hc/en-us/articles/15484384020756-Moderation-Tools-overview)
- [Reddit AutoModerator](https://support.reddithelp.com/hc/en-us/articles/15484574206484-Automoderator)
- [OpenStreetMap Quality Assurance](https://wiki.openstreetmap.org/wiki/Quality_assurance)
- [Crowdsourced Map Accuracy Assessment](https://www.maplibrary.org/9915/how-to-assess-crowdsourced-map-accuracy/)
- [UGC Moderation Best Practices - WebPurify](https://www.webpurify.com/blog/content-moderation-definitive-guide/)
- [UGC Moderation Guide - Utopia Analytics](https://www.utopiaanalytics.com/article/user-generated-content-moderation)
- [情報流通プラットフォーム対処法 - 総務省](https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/ihoyugai.html)
- [情報流通プラットフォーム対処法解説 - 契約ウォッチ](https://keiyaku-watch.jp/media/hourei/joho-platform-2024/)
- [位置情報とプライバシー保護](https://nao-lawoffice.jp/venture-startup/platform/ichijoho.php)
- [Google Play UGCポリシー](https://support.google.com/googleplay/android-developer/answer/9876937?hl=ja)
- [DAU/MAU Ratio - Geckoboard](https://www.geckoboard.com/best-practice/kpi-examples/dau-mau-ratio/)
- [Mobile App Retention Statistics 2026](https://www.amraandelma.com/mobile-app-retention-statistics/)
- [Firebase Cloud Functions Scheduling](https://firebase.google.com/docs/functions/schedule-functions)
- [Firestore TTL Policies](https://firebase.google.com/docs/firestore/ttl)
- [Firebase Cloud Messaging Admin SDK](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)
- [ActiveFence Trust and Safety](https://www.activefence.com/what-is-trust-and-safety/)
- [Community Gamification Guide - Gainsight](https://www.gainsight.com/blog/community-gamification/)
