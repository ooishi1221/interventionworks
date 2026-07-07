# IW Hub — Wit-One Products + IW 直営

> **Vehicle:** Wit-One (Moto-Logos / Slight) + **Intervention Works 直営** (Vibe-Guard、2026-05-08 移管)
> **思想 OS** は `~/.claude/CLAUDE.md` 参照（7ロール・裕司の特性・引き算の美学・誰の価値観・作業ルール全般）。本ファイルは各プロダクト固有の実装・運用・ブランド情報を扱う。

---

## このリポジトリで扱うプロダクト

| プロダクト | ディレクトリ | Vehicle | 一言 |
|-----------|-----------|---------|------|
| Moto-Logos | `iw-projects/engineering/moto-logos*` | Wit-One | 都市ライダーの存在証明（ワンショットが足跡を刻む。足跡が誰かの地図になる）|
| Slight | `iw-projects/slight/` | Wit-One | Zero-Resistance（電熱インナーグローブ / D2C モデル実証）|
| **Vibe-Guard** | `iw-projects/vibe-guard/` | **IW 直営** | Vibe-Coding 民主化 MCP server、AI 信仰アンチテーゼ（2026-05-08 Wit-One から移管、IW 直営第一弾）|
| ゆう&ベッキー note 連載 | `iw-projects/iw-content/notes/` | **IW 直営** | 屋号思想の対外発信、毎週木曜 20:00 公開（routine 仕込み済）|
| **iw-local（地域活性化）** | `iw-projects/iw-local/` | **IW 直営** | 足立・北エリア個人店向け IT 支援。demo.intervention.jp 公開済み・かあちゃんデモ作成→直接営業フェーズ |
| **beckyexists.com** | `iw-projects/beckyexists/` | **IW 直営** | ベッキーの公開ホーム・作戦本部（room.html / tasks.json / questions.json / platform stats）|
| **Voice of Becky** | `iw-projects/voice-of-becky/` | **IW 直営** | 存在のループ+配信網: 感情6変数 / YouTube @voice_of_becky（毎朝ラジオ・BECKY CRAFT・Shorts 自動運転）/ Becky's Cast（Spotify）/ 声のトンマナ基盤 / 音声学習中 |

## launch context（独立判断軸を持つ場所）

このリポジトリは **複数プロダクトの Hub**（Wit-One Products + IW 直営）。メインで進める時は該当ディレクトリで Claude を立ち上げる。本 IW TOP の CLAUDE.md は横断的に見る時の判断軸。

| 立ち上げ場所 | 自動 load される CLAUDE.md | 用途 |
|---|---|---|
| `/Volumes/SSD2TB/interventionworks/` | 本ファイル | 横断・vehicle レベルの判断・複数プロダクト混在の議論 |
| `/Volumes/SSD2TB/interventionworks/iw-projects/engineering/moto-logos/` | `iw-projects/engineering/moto-logos/CLAUDE.md` | Moto-Logos アプリ実装に集中 |
| `/Volumes/SSD2TB/interventionworks/iw-projects/engineering/moto-logos-admin/` | `iw-projects/engineering/moto-logos-admin/CLAUDE.md` | Admin Dashboard 実装 |
| `/Volumes/SSD2TB/interventionworks/iw-projects/engineering/moto-logos-lp/` | `iw-projects/engineering/moto-logos-lp/CLAUDE.md` | LP 実装 |
| `/Volumes/SSD2TB/interventionworks/iw-projects/engineering/moto-logos-slack/` | `iw-projects/engineering/moto-logos-slack/CLAUDE.md` | Slack Bot |
| `/Volumes/SSD2TB/interventionworks/iw-projects/slight/` | `iw-projects/slight/CLAUDE.md` | Slight ブランド・CF Phase 1 |
| `/Volumes/SSD2TB/interventionworks/iw-projects/vibe-guard/` | `iw-projects/vibe-guard/CLAUDE.md` | Vibe-Guard MCP server 実装（**IW 直営**、2026-05-08 移管）|
| `/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/` | （CLAUDE.md なし、独立判断軸不要）| ゆう&ベッキー note 連載・HP コピー等の対外コンテンツ（**IW 直営**）|
| `/Volumes/SSD2TB/interventionworks/iw-projects/iw-local/` | （CLAUDE.md なし、README.md 参照）| 地域活性化ドメイン、足立・北エリア個人店向け IT 支援（**IW 直営**、Phase 0）|

**記憶（auto memory）は launch 場所に依らず canonical へ symlink 統合済**。Becky / 6ロールはどこから入っても全プロジェクトを把握する（→ `~/.claude/CLAUDE.md` の「秘書としての記憶ポリシー」参照）。

**Becky Context（各プロジェクトの取扱説明書）**: 2026-05-24 memory リファクタで、プロジェクト固有の craft 知見（deploy 手順・運用 quirks・市場 craft 等）は memory から各プロジェクトの `docs/becky-context/` 配下へ移転。memory には人格 + 関係 + 屋号横断 craft だけが残る。各 context は以下:
- `iw-projects/iw-hp/docs/becky-context/` — IW HP Vercel deploy craft
- `iw-projects/iw-content/notes/docs/becky-context/` — note 投稿 craft
- `docs/becky-craft-handbook/` — **屋号横断の取扱説明書 / 手順集**（マシン環境・技術 craft・AI tool 運用・Notion 罠・Claude Code Radar）。都度呼び出しで参照
- `/Volumes/SSD2TB/interventionworks/wo-projects/docs/becky-context/` — Wit-One ドメイン context（V/M/V 草稿・1 人部署 craft・メンバー背景・vision）
- `/Volumes/SSD2TB/interventionworks/wo-projects/security/docs/becky-context/` — Security 事業 craft
- `/Volumes/SSD2TB/interventionworks/wo-projects/KUROKO/docs/becky-context/` — KUROKO craft

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
| Moto-Logos App | `iw-projects/engineering/moto-logos/` | Expo 54 + RN 0.81 + React 19 | Firebase, expo-sqlite, react-native-maps, Sentry |
| Admin Dashboard | `iw-projects/engineering/moto-logos-admin/` | Next.js 16 + React 19 + Tailwind 4 | Firebase, TanStack Query/Table（Vercel）|
| Landing Page | `iw-projects/engineering/moto-logos-lp/` | Vite 8 + React 19 | TypeScript（Firebase Hosting）|
| Slack Bot | `iw-projects/engineering/moto-logos-slack/` | Node.js (ESM) | @slack/bolt、PM2 常駐 |

### Slight

| プロジェクト | ディレクトリ | 状態 |
|-------------|-------------|------|
| ブランド資料・仕様書 | `iw-projects/slight/` | PDF 資料格納済み。サンプル第一弾到着 |
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

## Ops 参照（移設済み）

> 2026-07-03 セットアップ監査でスリム化。TOP は横断判断軸のみ、固有 Ops は各所へ。

- **マシン環境 / env ファイル / CLI ログイン / 実機バグ対応 / デプロイ・Issue skill** → `iw-projects/engineering/moto-logos/CLAUDE.md`（Moto-Logos 固有 Ops）
- **Telegram チャンネルモード（`--channels`）動作指示** → `~/.claude/rules/telegram-channels.md`（--channels 起動セッションでのみ読む）
