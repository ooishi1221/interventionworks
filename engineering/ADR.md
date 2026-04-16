# ADR — 技術選定理由書（Architecture Decision Records）

**最終更新:** 2026-04-16
**経緯:** 初期スタックはAI（Claude）主導で選定。2026-04-16 に CEO + Andy で妥当性を検証し、選定理由を明文化。

---

## ADR-001: モバイルアプリ — Expo + React Native

**決定:** Expo SDK 54 + React Native 0.81 + TypeScript

**選定理由:**

| 要件 | Expo + RN がなぜ合うか |
|------|----------------------|
| iOS / Android 同時リリース | 1コードベースで両OS。一人+AI体制では唯一の現実解 |
| 高速イテレーション | EAS Update でストア審査なしの OTA 配信。「小さく出して早く回す」に直結 |
| オフラインファースト | expo-sqlite + Firestore persistentLocalCache の組み合わせが自然に成立 |
| 地図中心のUI | react-native-maps は Google Maps/Apple Maps のネイティブラッパー。RN エコシステムで最も成熟 |
| AI開発効率 | TypeScript + React はAIの学習データ量が最大。生成精度が最も高い |

**却下した選択肢:**

| 選択肢 | 却下理由 |
|--------|---------|
| Flutter (Dart) | AIの精度が落ちる（学習データ量の差）。地図ライブラリの成熟度がRNより低い |
| ネイティブ (Swift + Kotlin) | 2倍の工数。一人+AI体制では維持不可能 |
| PWA | プッシュ通知・GPS バックグラウンド検知が制限される。到着検知（コア機能）が成立しない |

**リスク:**
- RN のメジャーアップデート時にライブラリ互換性問題が発生する可能性（Expo managed workflow で軽減）
- 地図描画のパフォーマンスはネイティブに劣る（現状の 754 スポット規模では問題なし、クラスタリングで対応済み）

**ステータス:** ✅ 承認 — このまま本番へ

---

## ADR-002: 管理ダッシュボード — Next.js + Vercel

**決定:** Next.js 16 (App Router) + TanStack Query/Table + Vercel

**選定理由:**

| 要件 | Next.js がなぜ合うか |
|------|---------------------|
| フロント + API 一体 | API Routes で Firebase Admin SDK を直接叩ける。別途バックエンドサーバー不要 |
| デプロイ運用ゼロ | `npx vercel deploy --prod` 一発。インフラ管理なし |
| データテーブル中心のUI | TanStack Table でフィルタ・ソート・ページネーションが楽に書ける |
| 認証 + ロール制御 | Firebase Auth + セッションCookie + Custom Claims。API Routes 内で Admin SDK が使えるから実現 |

**却下した選択肢:**

| 選択肢 | 却下理由 |
|--------|---------|
| Retool / Appsmith（ノーコード） | カスタム KPI（温度分布・足跡率）、モデレーション UI の自由度が足りない |
| Vite + React（API なし） | Firebase Admin SDK が使えない。ロール制御・BAN・監査ログがクライアントから書けない |
| Express / Hono 別サーバー | 管理ツールだけのためにサーバーを別途運用するのはオーバーキル |

**リスク:**
- API Routes にロジックが集中。アプリユーザー向け API を追加する場合は Cloud Functions に分離が必要（→ Issue #131）

**ステータス:** ✅ 承認 — このまま本番へ

---

## ADR-003: ランディングページ — Vite + React

**決定:** Vite 8 + React 19 + Firebase Hosting

**選定理由（推定）:**
- アプリと同じ React / TypeScript で統一されたため、AI が自然に選択
- Vite のビルド速度が高速で開発体験がよい
- Firebase Hosting にそのまま載せられる

**課題:**

| 問題点 | 詳細 |
|--------|------|
| SEO が弱い | SPA は静的 HTML より Google クロールで不利。「バイク駐車場 アプリ」等の検索流入に影響 |
| 初回表示が遅い | React ランタイム (~140KB) のロード後にレンダリング。静的 HTML なら即表示 |
| React の強みが活きない | 1ページ9セクションの静的コンテンツ。状態管理・コンポーネント再利用がほぼ不要 |

**より適した選択肢:**
- **Astro + React（部分ハイドレーション）** — ビルド時に静的 HTML 生成、必要な箇所だけ React。既存の .tsx コンポーネントを再利用可能。Core Web Vitals・SEO ともに有利

**ステータス:** ⚠️ 承認（暫定） — 動いてるので今すぐ変える必要はない。SEO 施策フェーズで Astro 移行を検討（→ Issue #132）

---

## ADR-004: バックエンド基盤 — Firebase

**決定:** Firebase (Firestore + Auth + Storage + Hosting) を全プロジェクト共通基盤とする

**選定理由:**

| 要件 | Firebase がなぜ合うか |
|------|---------------------|
| サーバー運用ゼロ | インフラエンジニア不在で本番運用できる。マネージドサービスとして最も包括的 |
| オフライン対応 | Firestore の persistentLocalCache がアプリのオフラインファースト設計と直結 |
| 認証一体 | Anonymous Auth（アプリ）+ メール/PW Auth（管理画面）が同一基盤で完結 |
| 写真ストレージ | Firebase Storage でアップロード → 公開 URL 取得が数行で書ける |
| 無料枠 | Spark プラン（無料）で DAU 数千規模まで運用可能 |

**却下した選択肢:**

| 選択肢 | 却下理由 |
|--------|---------|
| Supabase (PostgreSQL) | リレーショナル DB は駐車場データの空間検索に有利だが、オフラインキャッシュが Firestore ほど簡単ではない。RN 向け SDK も発展途上 |
| 自前サーバー (Express + PostgreSQL) | 運用コスト大。一人体制でサーバー監視・スケーリング・セキュリティパッチを維持するのは非現実的 |
| AWS Amplify | Firebase と同等の機能だが、エコシステムの成熟度と AI の精度で Firebase が上回る |

**将来の壁と対応方針:**

| タイミング | 壁 | 対応策 |
|-----------|-----|--------|
| MAU 5万超 | Firestore Read 課金が月額に効く | キャッシュ最適化 → Cloud Functions + CDN キャッシュレイヤー |
| 複合条件検索 | 「CC250以下 × 500m以内 × warm以上」等 | Algolia or Cloud Functions 内で検索ロジック |
| 外部データ連携 | JMPSA提携・s-park API 等 | Cloud Functions で中間層。Firestore → BigQuery エクスポートで分析基盤 |

**ステータス:** ✅ 承認 — MAU 5万が次の再評価ポイント（→ Issue #133, #134）

---

## ADR-005: 認証 — Firebase Anonymous Auth（アプリ）

**決定:** アプリは Firebase Anonymous Auth + デバイス ID (AsyncStorage) でユーザー識別

**選定理由:**
- ログイン画面なしで即利用開始。バイク降りた直後にアカウント作成を強要しない
- Firestore セキュリティルールの `request.auth != null` を満たせる
- 将来の Firebase Auth（ソーシャルログイン）への移行パスが確保済み（userId 差し替えのみ）

**課題:**
- **デバイス紛失・機種変・再インストールで足跡が全消え** — 存在証明がデバイスに縛られている。致命的
- Anonymous Auth のアカウントは Firebase が自動削除する可能性がある（30日間未使用時）

**対応方針:**
- ストアリリース前に Apple Sign-In + Google Sign-In を追加（→ Issue #130）
- 匿名→認証済みへのアカウントリンク（Firebase の `linkWithCredential`）で既存データを引き継ぐ

**ステータス:** ⚠️ 暫定承認 — 本番前にソーシャルログイン移行が必須

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-04-16 | 初版作成。ADR-001〜005 を一括記載 |
