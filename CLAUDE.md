# Wit-One Products — Moto-Logos / Slight

> **Vehicle:** Wit-One
> **思想 OS** は `~/.claude/CLAUDE.md` 参照（6ロール・CEO特性・引き算の美学・誰の価値観・作業ルール全般）。本ファイルは Moto-Logos / Slight 固有の実装・運用・ブランド情報のみ扱う。

---

## このリポジトリで扱うプロダクト

| プロダクト | ディレクトリ | 一言 |
|-----------|-----------|------|
| Moto-Logos | `engineering/moto-logos*` | 都市ライダーの存在証明（ワンショットが足跡を刻む。足跡が誰かの地図になる）|
| Slight | `slight/` | Zero-Resistance（電熱インナーグローブ / D2C モデル実証）|

## launch context（独立判断軸を持つ場所）

このリポジトリは **2 プロダクトの Hub**。メインで進める時は該当ディレクトリで Claude を立ち上げる。本 IW TOP の CLAUDE.md は両者を横断的に見る時の判断軸。

| 立ち上げ場所 | 自動 load される CLAUDE.md | 用途 |
|---|---|---|
| `/Volumes/SSD2TB/interventionworks/` | 本ファイル | 横断・vehicle レベルの判断・両プロダクト混在の議論 |
| `/Volumes/SSD2TB/interventionworks/engineering/moto-logos/` | `engineering/moto-logos/CLAUDE.md` | Moto-Logos アプリ実装に集中 |
| `/Volumes/SSD2TB/interventionworks/engineering/moto-logos-admin/` | `engineering/moto-logos-admin/CLAUDE.md` | Admin Dashboard 実装 |
| `/Volumes/SSD2TB/interventionworks/engineering/moto-logos-lp/` | `engineering/moto-logos-lp/CLAUDE.md` | LP 実装 |
| `/Volumes/SSD2TB/interventionworks/engineering/moto-logos-slack/` | `engineering/moto-logos-slack/CLAUDE.md` | Slack Bot |
| `/Volumes/SSD2TB/interventionworks/slight/` | `slight/CLAUDE.md` | Slight ブランド・CF Phase 1 |

**記憶（auto memory）は launch 場所に依らず canonical へ symlink 統合済**。Becky / 6ロールはどこから入っても全プロジェクトを把握する（→ `~/.claude/CLAUDE.md` の「秘書としての記憶ポリシー」参照）。

---

## Moto-Logos のコンセプト: 存在証明

Moto-Logos は「バイク駐車場の検索アプリ」ではない。**都市ライダーの存在証明**である。ライダーの体験すべて（停めた場所、食った飯、見た景色、走った道）をワンショット（写真1枚）で刻む。AIが分類。自分のノートに残り、誰かの地図になる。分類しない、撮るだけ。

- **手段:** ワンショットで足跡を刻む。集積が地図になる
- **最初の検証:** バイク駐車場（都市特有の痛み。地方ツーリングでは困らない）
- **ターゲット:** 首都圏の都市ライダー。拡張は都市間横展開（東京→大阪→名古屋→福岡）
- **世界観:** 評価しない、競わない、ただ「いた」ことが刻まれる

### 「常識」に対する答え

| 「常識」 | 我々の答え |
|---------|-----------|
| スポット登録はフォームで入力 | グローブしたまま写真1枚で終わるべき |
| レビューは星評価 | 駐車場は評価するものじゃない。情報が合ってたかどうかだ |
| 貢献をランクで可視化 | 存在に序列はない。足跡の数だけ見せろ |
| ユーザーに「報告」を求める | ライダーは自分のためにメモするだけ。それが勝手に誰かの役に立つ |
| UGCの善意に頼る | 善意の搾取。到着後に「自分のため」に開く理由を設計しろ |

### 引き算するもの

**引き算する:** 評価 / 競争 / 強制 / 通知
**反乱する対象:** エンゲージメント漬けのアプリ業界
**守りたい一点:** 存在の感度

---

## Slight のコンセプト: Zero-Resistance

Slight は「電熱グローブ」ではない。**ライダーとバイクの間にある抵抗をゼロにする**ブランドである。「機能」を言い訳に「美学」を捨て、「安全」の名のもとに野暮ったい装備を押し付けてきた業界に介入する。

- **思想:** "Whose values?" / "Don't be a jerk." / DISTURB NOTHING
- **3フェーズ:** Tactile Integrity（触覚の復権・0.5mm）→ Aesthetic Liberation（街に溶け込むシルエット）→ Cultural Insurrection（「安全ならダサくていい」への反論）
- **D2C 実証 PoC:** 企画→ファブレス製造→CF 販売を一気通貫。成功プロセスをパッケージ化してウィットワンの D2C 伴走コンサル営業エビデンスにする
- **初弾スペック:** 5,000 円 / 300 個受注生産 / CF 開始 14 日で目標 50% 未達なら凍結 / 投資額約 30 万円

### 「常識」に対する答え

| 「常識」 | 我々の答え |
|---------|-----------|
| 電熱グローブは分厚くて当然 | 0.5mm で指先だけ温める。操作性を殺すなら本末転倒 |
| 安全のためにゴツくていい | 街に溶け込むシルエット。ダサさは安全の代償じゃない |
| 温度調整は3段階ボタン | 物理スイッチなし。繋げば ON、外せば OFF |
| USB ケーブル同梱 | 全員持ってる。同梱はコストと環境の無駄 |
| パッケージは箱 | 車検証入れになる耐水ケース。捨てられないパッケージにしろ |

### 引き算するもの

**引き算する:** 厚さ / 機能 / 装飾 / 同梱物
**反乱する対象:** ゴツいバイクギア業界
**守りたい一点:** 触覚の感度

---

## 既知の戦略課題

Moto-Logos は「ライダーとして不便」の個人痛から始まり後から「存在証明」で上位化した構造上、forward vector（文化拡張のストーリー）が弱い。retention 専業で割り切るか、文化資産化（星図の SNS 流出等）で外向き化するかは、β 結果を見て判断する。

---

## Tech Stack

### Moto-Logos

| プロジェクト | ディレクトリ | フレームワーク | 主要依存 |
|-------------|-------------|---------------|---------|
| Moto-Logos App | `engineering/moto-logos/` | Expo 54 + RN 0.81 + React 19 | Firebase, expo-sqlite, react-native-maps, Sentry |
| Admin Dashboard | `engineering/moto-logos-admin/` | Next.js 16 + React 19 + Tailwind 4 | Firebase, TanStack Query/Table（Vercel）|
| Landing Page | `engineering/moto-logos-lp/` | Vite 8 + React 19 | TypeScript（Firebase Hosting）|
| Slack Bot | `engineering/moto-logos-slack/` | Node.js (ESM) | @slack/bolt、PM2 常駐 |

### Slight

| プロジェクト | ディレクトリ | 状態 |
|-------------|-------------|------|
| ブランド資料・仕様書 | `slight/` | PDF 資料格納済み。サンプル第一弾到着 |
| CF ページ | 未着手 | Month 2〜3 で制作予定 |

**共通:** TypeScript / npm / Firebase (Firestore, Auth, Hosting, Functions) / Node v24.14.1 (nvm 管理)

### 検証パターン（実装後に必ず実行）

1. `npx tsc --noEmit` — 型チェック
2. `npm run build` — ビルド成功確認
3. `npm run dev` — dev server 起動して目視確認
4. UI 変更はスクリーンショットで確認
5. **EAS Build 前: `.env` 変更ありなら `eas env:push <channel> --path .env --force`**（忘れると Firebase invalid-api-key で無言死）

---

## Security

<important if="セキュリティ変更・API Route 追加・デプロイ前・環境変数操作">

- **詳細ポリシー: `SECURITY.md`**（ルート直下）に脅威モデル・pre-commit hook 仕様・インシデント対応フロー全て記載
- `.env*`, `serviceAccount*.json` は**絶対に commit しない**（pre-commit で secretlint が自動検知）
- API キー・パスワードをコード・設定ファイルにハードコードしない
- Firebase Admin SDK の鍵はローカルのみ（`/tmp/` or 環境変数経由）
- `settings.local.json` にクレデンシャルを含めない
- **デプロイ前に `npm run security-check` を叩く**（secretlint 全件 + 各プロジェクトの npm audit）
- 新規 API Route 追加時は `requireAuth(minimumRole)` を必ず通す（破壊系は `moderator` 以上、super_admin 限定系は `super_admin`）

</important>

---

## マシン環境（Mac mini M4 プライマリ）

**基本方針:** Mac mini M4 をリモートアクセスで常用。Node v24.14.1 を nvm で管理。詳細な引っ越し手順（CLI ログイン、EAS Secrets 確認、Android ローカルビルド等）が必要になった時は `docs/machine-setup.md` を参照。

### env ファイル一覧（**git 管理外・手動配置必須**）

| パス | 用途 | 主なキー |
|------|------|---------|
| `engineering/moto-logos/.env` | モバイルアプリ | `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| `engineering/moto-logos-admin/.env.local` | Admin Dashboard | `FIREBASE_ADMIN_*`, `NEXT_PUBLIC_FIREBASE_*`, `GEMINI_API_KEY` |
| `engineering/moto-logos-lp/.env.local` | LP (Vite) | `VITE_FIREBASE_*` |
| `engineering/moto-logos-slack/.env` | Slack Bot | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_WEBHOOK_URL` |

**秘密鍵（絶対 commit 禁止）:** `engineering/moto-logos/scripts/moto-spotter-firebase-adminsdk-*.json`（Admin SDK 鍵）

### CLI ログイン状態（確認コマンド）

```bash
cd engineering/moto-logos && npx eas whoami        # yuji1221
npx firebase login:list && npx firebase use moto-spotter
cd ../moto-logos-admin && npx vercel whoami        # yujiooishi-8378
```

---

## 実機バグ対応プレイブック

<important if="実機で動かない・表示されない・クラッシュ">

**仮説ドリブンで深掘りに走る前に、以下を機械的に確認する。** これを飛ばすと 2026-04-20 の `EXPO_PUBLIC_*` 未注入で数時間ハマった事例を再発する。

### 最初の 30 秒でやる 3 点

1. **環境変数の注入確認**: `cd engineering/moto-logos && npm run preflight [preview|production]`
   - EAS Secrets と `.env` の差分 / app.json 必須項目 / Firestore rules を一括チェック
2. **Sentry 管理画面**: https://moto-logos-team.sentry.io/projects/moto-logos/ で直近 Issue を確認
   - Slack `#moto-logos-dev-log` にもリアルタイム通知が飛ぶのでそこも即確認
3. **CEO にデバッグシェア依頼**: 設定 → サポート → 「デバッグ情報を開発者に送信」を押してもらう
   - Firestore `debug_reports` に書き込まれ、Slack Bot が整形通知（uid / build / update ID / 直近エラー3件）

### 深掘り仮説に入る判断軸

- 上記 3 点で **手がかりが見つからない場合のみ** 仮説検証に入る
- 修正を 3 回重ねても再現するなら**前提を疑い直す**（API Key の存在確認、ビルド内容の実機目視など）
- 症状のヒアリングは「何が起きないか」より「どこまでは起きるか」を優先（診断 Alert で段階切り分け）

</important>

---

## デプロイ / Issue 対応

- デプロイ: `/deploy-admin`, `/deploy-lp` skill
- Issue: `/fix-issue <番号>` skill（取得→調査→実装→検証→コミット→クローズ）
