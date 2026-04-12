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

## API エンドポイント

| パス | 概要 |
|------|------|
| `/api/dashboard/stats` | スポット総数・ユーザー総数・審査待ち・レビュー総数 |
| `/api/dashboard/kpi` | DAU/WAU/MAU + 30日間トレンドデータ |
| `/api/audit-log` | モデレーション監査ログ（ページネーション対応） |
| `/api/spots` | スポット CRUD + bulk-status / bulk-update / export / import |
| `/api/users` | ユーザー CRUD + ロール管理 |
| `/api/reports` | 通報管理 + resolve |

## Firestore コレクション

- `spots` — 駐輪場スポット
- `users` — ユーザー
- `reviews` — レビュー
- `validations` — Good/Bad 投票
- `user_activity` — 日次アクティビティ（DAU/WAU/MAU 集計用、アプリ側で記録）
- `moderation_logs` — 管理操作の監査ログ（本ダッシュボードで新規作成）
