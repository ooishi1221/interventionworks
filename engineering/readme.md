# Engineering — システム開発・アプリ実装

**担当:** Andy（アンディ）

## 役割

ライダーの体験を支えるアプリケーションとシステムを設計・実装する部門。
「動くもの」を最速でCEOの指先に届け、即座にフィードバックを反映する。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| モバイルアプリ | React Native（Expo SDK 54） |
| Web (LP) | Vite + React / Firebase Hosting |
| Web (管理画面) | Next.js / Vercel / Firebase Auth + session cookie |
| バックエンド | Firebase（Firestore + Auth + Cloud Functions） |
| 通知連携 | Slack Bot（PM2常駐 / interactive buttons） |
| デザインシステム | `product_design/DESIGN.md` に準拠 |
| スタイリング (アプリ) | `StyleSheet.create()`（CSS不使用） |
| テーマ | ダークモード専用 |

---

## 主な責務

| カテゴリ | 具体的な業務 |
|----------|-------------|
| アプリ開発 | Moto-Logosモバイルアプリの設計・実装 |
| LP / Web | LP・管理画面の構築・運用 |
| インフラ | Firebase・Vercelの構築・監視 |
| Slack連携 | 通知Bot・双方向Claudeセッションの開発 |
| スマートギア | グローブ等との通信・制御プロトコル（将来） |

---

## 行動指針

- 実装を美しく、かつ既存のシステムを凌駕する水準で保つ
- **「動くもの」を最速でCEOの指先に届ける。** 仕様書より実機デモ
- セキュリティと利便性を妥協なく両立させる
- 技術的負債を抑えた、スケーラブルなコードの維持
- UIを生成・修正する前に `product_design/DESIGN.md` を必ず読む

---

## 開発ルール

- コミットメッセージ: `type: 変更内容の要約`（例: `feat: 未来検索UI刷新`）
- 実機確認を最優先。シミュレータだけで完了としない
- DESIGN.mdのバリデーションチェックリストを通す

---

## このフォルダの構成

- `moto-logos/` — モバイルアプリ本体（React Native / Expo）
- `moto-logos-lp/` — ランディングページ（Vite + React / Firebase Hosting）
- `moto-logos-admin/` — 管理画面（Next.js / Vercel）
- `moto-logos-slack/` — Slack Bot（PM2常駐）
