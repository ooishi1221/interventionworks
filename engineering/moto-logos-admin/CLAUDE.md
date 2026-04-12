# Moto-Logos Admin（管理ダッシュボード）

## 概要

**目的:** Moto-Logos アプリのスポット・ユーザー・レビューを管理する内部ツール
**URL:** https://moto-logos-admin.vercel.app

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 状態管理 | TanStack Query + TanStack Table |
| 認証 | Firebase Auth (メール/パスワード) + セッションCookie |
| バックエンド | Firebase Admin SDK (Next.js API Routes) |
| ホスティング | Vercel（`npx vercel deploy --prod`） |

## ローカル開発

```bash
npm run dev
```

## デプロイ

```bash
npx vercel deploy --prod
```

## 認証・ロール

| ロール | 権限 |
|--------|------|
| super_admin | 全操作 + ロール管理 |
| moderator | スポット/ユーザー編集 + 閲覧 |
| viewer | 閲覧のみ |

Firebase Auth Custom Claims でロールを管理。

## デザインシステム（アプリと統一）

| トークン | 値 | 用途 |
|----------|-----|------|
| `--background` | `#0D0D0D` | ページ背景 |
| `--surface` | `#1A1A1A` | セクション背景 |
| `--card` | `#242424` | カード |
| `--accent` | `#FF6B00` | CTA・強調 |
| `--foreground` | `#F5F5F5` | 本文 |
| `--text-secondary` | `#A0A0A0` | 補助テキスト |

## ダッシュボード画面

| 画面 | パス | 概要 |
|------|------|------|
| ダッシュボード | `/` | KPIカード（DAU/WAU/MAU/スティッキネス/リテンション/投稿率/検証率）+ トレンドグラフ + 鮮度/ランク分布 + エリアカバレッジ |
| モデレーション | `/moderation` | 審査待ちスポットの承認/却下 |
| 通報管理 | `/reports` | ユーザー通報の確認・対応 |
| スポット管理 | `/spots` | CRUD + 一括操作 + CSV入出力 + 編集履歴リンク |
| ユーザー管理 | `/users` | 一覧・検索・フィルタ・BAN管理 |
| ユーザー詳細 | `/users/[id]` | 投稿履歴・レビュー履歴・BAN/UNBAN・trustScore手動調整・ランク昇降格 |
| 鮮度アラート | `/freshness` | 未更新スポット一覧 + 一括pending化 + スポット確認依頼通知 |
| 重複検出 | `/duplicates` | 重複候補スポット一覧（50m以内 + 名称類似）+ マージ機能 |
| セキュリティ | `/security` | 異常検知・複数アカウント・写真確認キュー・BAN解除申請（4タブ） |
| 通知管理 | `/notifications` | 一斉通知・エリア別セグメント通知・お知らせ投稿 |
| ゲーミフィケーション | `/gamification` | 貢献者ランキング・ポイント付与ルール・バッジ定義管理（3タブ） |
| 監査ログ | `/audit-log` | 管理操作の完全な監査証跡（targetId フィルタ対応） |
| ロール管理 | `/roles` | 管理者ロールの付与・変更（super_admin専用） |

## API エンドポイント

| パス | 概要 |
|------|------|
| `/api/dashboard/stats` | スポット総数・ユーザー総数・審査待ち・レビュー総数 |
| `/api/dashboard/kpi` | DAU/WAU/MAU + スティッキネス + リテンション + 投稿率 + 検証率 + 鮮度分布 + ランク分布 + エリアカバレッジ + モデレーション処理時間 |
| `/api/dashboard/freshness` | 鮮度アラート（GET: カテゴリ別一覧 / POST: 一括pending化） |
| `/api/audit-log` | モデレーション監査ログ（ページネーション + targetType/targetId フィルタ対応） |
| `/api/spots` | スポット CRUD + bulk-status / bulk-update / export / import |
| `/api/users` | ユーザー CRUD + 検索 + フィルタ（rank, banStatus） |
| `/api/users/[id]` | GET: 詳細取得 / PATCH: trustScore・rank 手動調整（監査ログ付き） |
| `/api/users/[id]/ban` | ユーザーBAN（一時停止/永久停止） |
| `/api/users/[id]/unban` | BAN解除 |
| `/api/reports` | 通報管理 + resolve |
| `/api/ng-words` | NGワードリスト管理（GET/PUT） |
| `/api/notifications/send` | 個別ユーザーへのプッシュ通知 |
| `/api/notifications/broadcast` | 全ユーザー一斉通知（プラットフォーム別対応） |
| `/api/notifications/segment` | エリア別セグメント通知（geohash プレフィクスで絞り込み） |
| `/api/notifications/verify-spot` | スポット確認依頼通知（関連ユーザーに「まだありますか？」） |
| `/api/spots/duplicates` | 重複候補検出（半径50m + レーベンシュタイン距離 < 3） |
| `/api/spots/merge` | スポットマージ（カウント合算 + レビュー移行 + 削除） |
| `/api/users/[id]/activity` | ユーザー行動ログ（レビュー・スポット登録の統合タイムライン） |
| `/api/moderation/anomalies` | 異常行動検知（スパム・高頻度・評価操作） |
| `/api/moderation/multi-account` | 複数アカウント検知（レビュー対象重複分析） |
| `/api/moderation/photos` | 写真付きレビューの目視確認キュー |
| `/api/moderation/appeals` | BAN解除申請（POST: 申請 / GET: 一覧 / PATCH: 承認・却下） |
| `/api/users/ranking` | 週間/月間貢献者ランキング（レビュー+スポットでスコアリング） |
| `/api/settings/point-rules` | 貢献ポイント付与ルール管理（GET/PUT） |
| `/api/settings/badges` | バッジ定義管理（GET/POST/DELETE） |
| `/api/announcements` | お知らせ管理（GET: 一覧 / POST: 投稿 → アプリ内表示） |
| `/api/inquiries` | お問い合わせ一覧（GET: アプリから送信された問い合わせ） |
| `/api/cron/stale-spots` | 6ヶ月→pending + 12ヶ月+goodCount=0→closed（Vercel Cron 毎日3:00 UTC） |

## Firestore コレクション

- `spots` — 駐輪場スポット
- `users` — ユーザー（banStatus, banReason 等のBAN情報含む）
- `reviews` — レビュー
- `validations` — Good/Bad 投票
- `user_activity` — 日次アクティビティ（DAU/WAU/MAU 集計用、アプリ側で記録）
- `moderation_logs` — 管理操作の監査ログ（本ダッシュボードで新規作成）
- `reports` — ユーザー通報
- `ban_appeals` — BAN解除申請（userId, reason, status, reviewedBy）
- `push_tokens` — Expo Push トークン（deviceId をキー）
- `announcements` — アプリ内お知らせ（title, body, createdAt）
- `inquiries` — お問い合わせ（userId, category, message, status）
- `badge_definitions` — バッジ定義（name, icon, condition, sortOrder）
- `settings/point_rules` — 貢献ポイント付与ルール設定ドキュメント
