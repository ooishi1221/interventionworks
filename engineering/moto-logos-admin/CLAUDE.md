# Moto-Logos Admin（管理ダッシュボード）

## 概要

**目的:** Moto-Logos アプリのスポット・ユーザー・レビューを管理する内部ツール
**URL:** https://moto-logos-admin.web.app（予定）

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 状態管理 | TanStack Query + TanStack Table |
| 認証 | Firebase Auth (メール/パスワード) + セッションCookie |
| バックエンド | Firebase Admin SDK (Next.js API Routes) |
| ホスティング | Firebase Hosting（プロジェクト: `moto-spotter`、サイト: `moto-logos-admin`） |

## ローカル開発

```bash
npm run dev
```

## デプロイ

```bash
npm run build && firebase deploy --only hosting:moto-logos-admin --project moto-spotter
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

## Firestore コレクション

- `spots` — 駐輪場スポット
- `users` — ユーザー
- `reviews` — レビュー
- `validations` — Good/Bad 投票
- `moderation_logs` — 管理操作の監査ログ（本ダッシュボードで新規作成）
