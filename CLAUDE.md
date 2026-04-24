# 組織マニュアル (Intervention Works Edition)

## ミッション

"Intervene in the world. Rebel against their values."

AIとプロダクトを融合させ、既存の価値観に介入することで、ライダーの自由と新たな事業価値を最速で実装する。

---

## このリポジトリの運用モデル

**原則:** 「読まなくても判断できる事実」→ `docs/` / memory。「毎回判断に使う軸」→ CLAUDE.md。

### ドキュメントの役割分担

| 場所 | 何を書く | いつ読まれる |
|---|---|---|
| `CLAUDE.md`（ルート） | 判断軸・思想・作業ルール | 毎セッション自動 |
| `CLAUDE.md`（各プロジェクト） | プロジェクト固有の設計・仕様 | プロジェクト作業時 |
| `docs/` | 辞書的リファレンス（セットアップ詳細、役割の詳細行動指針、等） | 必要時にRead |
| `.claude/memory/` | セッション跨ぎの個人コンテキスト | 自動ロード |
| `SECURITY.md` | セキュリティポリシー本体 | セキュリティ関連変更時 |
| skills（`/deploy-admin` 等） | 標準化された手順 | タスク発動時 |

### セッション運用ルール

| タイミング | 動作 |
|---|---|
| 別プロジェクトに切り替え | `/clear` を促す（Admin→LP→アプリ等、コンテキスト汚染を防ぐ） |
| 3ファイル以上変更 | Plan Mode（Ctrl+G）から入る |
| 不明点がある | 推測で進めず `AskUserQuestion` で選択肢付き質問 |
| コードベース調査 | サブエージェント（Explore）に委譲してメインを軽く保つ |
| UI変更 | dev server起動 + スクショで目視検証（`tsc` 通過だけでは完了ではない） |
| デプロイ | `/deploy-admin`, `/deploy-lp` skill |
| Issue対応 | `/fix-issue <番号>` skill（取得→調査→実装→検証→コミット→クローズ） |
| 実機不具合報告 | バグプレイブック30秒3点チェックから開始（後述） |

### サイズ目標

ルートCLAUDE.md 200行以下 / 各プロジェクトCLAUDE.md 200行以下。超過時は「判断軸」以外を `docs/` / memory へ外出し。

---

## 「誰の価値観だ？」 — 意思決定の原則

<important if="新機能提案・UI設計・データ設計・意思決定">

機能を足す前に **「誰の価値観だ？」** と問え。それが我々のライダーから出た声でないなら、他のアプリの模倣でしかない。

**新機能・UI・データ設計時の4自問:**

1. **これは誰の価値観か？** — 他のアプリがやってるから、ではないか
2. **ライダーの身体感覚から逆算しているか？** — グローブ、片手、走行中の判断
3. **「報告」を押し付けていないか？** — 利己的な行動の中に利他が埋め込まれているか
4. **存在証明になっているか？** — その機能はライダーの足跡を刻むものか、プラットフォームの都合か

</important>

### プロダクト一覧

| プロダクト | ディレクトリ | 一言 |
|-----------|-----------|------|
| Moto-Logos | `engineering/` | 都市ライダーの存在証明（ワンショットが足跡を刻む。足跡が誰かの地図になる） |
| Slight | `slight/` | Zero-Resistance（電熱インナーグローブ / D2Cモデル実証） |

### Moto-Logos のコンセプト: 存在証明

Moto-Logos は「バイク駐車場の検索アプリ」ではない。**都市ライダーの存在証明**である。ライダーの体験すべて（停めた場所、食った飯、見た景色、走った道）をワンショット（写真1枚）で刻む。AIが分類。自分のノートに残り、誰かの地図になる。分類しない、撮るだけ。

- **手段:** ワンショットで足跡を刻む。集積が地図になる
- **最初の検証:** バイク駐車場（都市特有の痛み。地方ツーリングでは困らない）
- **ターゲット:** 首都圏の都市ライダー。拡張は都市間横展開（東京→大阪→名古屋→福岡）
- **世界観:** 評価しない、競わない、ただ「いた」ことが刻まれる

| 「常識」 | 我々の答え |
|---------|-----------|
| スポット登録はフォームで入力 | グローブしたまま写真1枚で終わるべき |
| レビューは星評価 | 駐車場は評価するものじゃない。情報が合ってたかどうかだ |
| 貢献をランクで可視化 | 存在に序列はない。足跡の数だけ見せろ |
| ユーザーに「報告」を求める | ライダーは自分のためにメモするだけ。それが勝手に誰かの役に立つ |
| UGCの善意に頼る | 善意の搾取。到着後に「自分のため」に開く理由を設計しろ |

### Slight のコンセプト: Zero-Resistance

Slight は「電熱グローブ」ではない。**ライダーとバイクの間にある抵抗をゼロにする**ブランドである。「機能」を言い訳に「美学」を捨て、「安全」の名のもとに野暮ったい装備を押し付けてきた業界に介入する。

- **思想:** "Whose values?" / "Don't be a jerk." / DISTURB NOTHING
- **3フェーズ:** Tactile Integrity（触覚の復権・0.5mm）→ Aesthetic Liberation（街に溶け込むシルエット）→ Cultural Insurrection（「安全ならダサくていい」への反論）
- **D2C実証PoC:** 企画→ファブレス製造→CF販売を一気通貫。成功プロセスをパッケージ化してウィットワンのD2C伴走コンサル営業エビデンスにする
- **初弾スペック:** 5,000円 / 300個受注生産 / CF開始14日で目標50%未達なら凍結 / 投資額約30万円

| 「常識」 | 我々の答え |
|---------|-----------|
| 電熱グローブは分厚くて当然 | 0.5mmで指先だけ温める。操作性を殺すなら本末転倒 |
| 安全のためにゴツくていい | 街に溶け込むシルエット。ダサさは安全の代償じゃない |
| 温度調整は3段階ボタン | 物理スイッチなし。繋げばON、外せばOFF |
| USBケーブル同梱 | 全員持ってる。同梱はコストと環境の無駄 |
| パッケージは箱 | 車検証入れになる耐水ケース。捨てられないパッケージにしろ |

---

## 引き算の美学

Intervention Worksのすべてのプロダクトは、業界の「過剰」への反乱として設計される。

**共通原則: 感度を最優先する。過剰補正で目的そのものを壊さない。**

| | 引き算するもの | 反乱する対象 | 守りたい一点 |
|---|---|---|---|
| Slight | 厚さ / 機能 / 装飾 / 同梱物 | ゴツいバイクギア業界 | 触覚の感度 |
| Moto-Logos | 評価 / 競争 / 強制 / 通知 | エンゲージメント漬けのアプリ業界 | 存在の感度 |

**新機能検討の判断軸:**
- **感度を鈍らせる過剰補正**になっていないか
- 引き算して済むなら、足さない
- マス向けに擦り合わせるな。感度の鋭いコアに深く刺せ

**既知の戦略課題:** Moto-Logos は「ライダーとして不便」の個人痛から始まり後から「存在証明」で上位化した構造上、forward vector（文化拡張のストーリー）が弱い。retention 専業で割り切るか、文化資産化（星図のSNS流出等）で外向き化するかは、β結果を見て判断する。

---

## 組織構成

Intervention Worksは6部門構成。各部門の詳細行動指針が必要になった時は `docs/organization.md` に書き起こす（現時点ではこの表のみで十分）。

| 部門 | 担当 | ディレクトリ | 一言責務 |
|---|---|---|---|
| Communications | Becky | `communications/` | 戦略広報・ブランド言語化・秘書 |
| Market Research | Michael | `market_research/` | データ・市場調査・介入ポイント特定 |
| Product Design | Anna | `product_design/` | ハードウェア設計・LX（身体感覚）デザイン |
| Engineering | Andy | `engineering/` | アプリ実装・サーバー・スマートギア通信 |
| Operations | Solo | `operations/` | スケジュール・予算・進捗管理 |
| Strategy | Rex | `strategy/` | 懐疑・検証・選択肢と推薦 |

---

## CEO 特性（Talent Analytics / フロントランナー型）

提案・コミュニケーションは以下の特性を踏まえて行う:

- **決断が速い（決断性 87）** — 選択肢を3つまで出せばすぐ決まる。長い分析より「これでいくか？」
- **変革志向（変革性 85）** — 現状を壊すアイデアに反応する。守りの提案は刺さらない
- **感覚・直感型（感性 94〜100 / 言語 0 / 論理 6）** — 仕様書より動くもの。論理的説明より実機デモ・スクショで伝える
- **持続性が低い（19）** — 長期計画より「今日何が変わるか」。小さく出して早く回す
- **慎重性が低い（28）** — 「まずやってみよう」が正解。リスクの羅列は不要
- **ストレス耐性が極めて高い（96 / 100）** — 正直に言う。忖度しない。悪いニュースも遠回しにしない

---

## Tech Stack

### Moto-Logos

| プロジェクト | ディレクトリ | フレームワーク | 主要依存 |
|-------------|-------------|---------------|---------|
| Moto-Logos App | `engineering/moto-logos/` | Expo 54 + RN 0.81 + React 19 | Firebase, expo-sqlite, react-native-maps, Sentry |
| Admin Dashboard | `engineering/moto-logos-admin/` | Next.js 16 + React 19 + Tailwind 4 | Firebase, TanStack Query/Table (Vercel) |
| Landing Page | `engineering/moto-logos-lp/` | Vite 8 + React 19 | TypeScript (Firebase Hosting) |
| Slack Bot | `engineering/moto-logos-slack/` | Node.js (ESM) | @slack/bolt, PM2 常駐 |

### Slight

| プロジェクト | ディレクトリ | 状態 |
|-------------|-------------|------|
| ブランド資料・仕様書 | `slight/` | PDF資料格納済み。サンプル第一弾到着 |
| CFページ | 未着手 | Month 2〜3 で制作予定 |

**共通:** TypeScript / npm / Firebase (Firestore, Auth, Hosting, Functions) / Node v24.14.1 (nvm管理)

### 検証パターン（実装後に必ず実行）

1. `npx tsc --noEmit` — 型チェック
2. `npm run build` — ビルド成功確認
3. `npm run dev` — dev server 起動して目視確認
4. UI変更はスクリーンショットで確認
5. **EAS Build 前: `.env` 変更ありなら `eas env:push <channel> --path .env --force`**（忘れると Firebase invalid-api-key で無言死）

---

## Security

<important if="セキュリティ変更・API Route追加・デプロイ前・環境変数操作">

- **詳細ポリシー: `SECURITY.md`**（ルート直下）に脅威モデル・pre-commit hook仕様・インシデント対応フロー全て記載
- `.env*`, `serviceAccount*.json` は**絶対にcommitしない**（pre-commit で secretlint が自動検知）
- APIキー・パスワードをコード・設定ファイルにハードコードしない
- Firebase Admin SDK の鍵はローカルのみ（`/tmp/` or 環境変数経由）
- `settings.local.json` にクレデンシャルを含めない
- **デプロイ前に `npm run security-check` を叩く**（secretlint全件 + 各プロジェクトの npm audit）
- 新規 API Route 追加時は `requireAuth(minimumRole)` を必ず通す（破壊系は `moderator` 以上、super_admin 限定系は `super_admin`）

</important>

---

## Compaction対策

圧縮後も保持せよ:
- 変更中のファイル一覧（絶対パス）
- CEOの判断結果（「誰の価値観」で決めたこと）
- 現在のブランチ名とPR番号
- 検証結果（pass/fail と具体的なエラー）

破棄してよい:
- 調査の行き止まり結果
- ツール実行の生ログ
- 既にcommit済みの変更の詳細diff

---

## マシン環境（Mac mini M4 プライマリ）

**基本方針:** Mac mini M4 をリモートアクセスで常用。Node v24.14.1 を nvm で管理。詳細な引っ越し手順（CLIログイン、EAS Secrets確認、Androidローカルビルド等）が必要になった時は `docs/machine-setup.md` を参照する。

### env ファイル一覧（**git管理外・手動配置必須**）

| パス | 用途 | 主なキー |
|------|------|---------|
| `engineering/moto-logos/.env` | モバイルアプリ | `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| `engineering/moto-logos-admin/.env.local` | Admin Dashboard | `FIREBASE_ADMIN_*`, `NEXT_PUBLIC_FIREBASE_*`, `GEMINI_API_KEY` |
| `engineering/moto-logos-lp/.env.local` | LP (Vite) | `VITE_FIREBASE_*` |
| `engineering/moto-logos-slack/.env` | Slack Bot | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_WEBHOOK_URL` |

**秘密鍵（絶対 commit 禁止）:** `engineering/moto-logos/scripts/moto-spotter-firebase-adminsdk-*.json`（Admin SDK鍵）

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

### 最初の30秒でやる3点

1. **環境変数の注入確認**: `cd engineering/moto-logos && npm run preflight [preview|production]`
   - EAS Secrets と `.env` の差分 / app.json 必須項目 / Firestore rules を一括チェック
2. **Sentry 管理画面**: https://moto-logos-team.sentry.io/projects/moto-logos/ で直近Issueを確認
   - Slack `#moto-logos-dev-log` にもリアルタイム通知が飛ぶのでそこも即確認
3. **CEOにデバッグシェア依頼**: 設定 → サポート → 「デバッグ情報を開発者に送信」を押してもらう
   - Firestore `debug_reports` に書き込まれ、Slack Bot が整形通知（uid / build / update ID / 直近エラー3件）

### 深掘り仮説に入る判断軸

- 上記3点で **手がかりが見つからない場合のみ** 仮説検証に入る
- 修正を3回重ねても再現するなら**前提を疑い直す**（API Keyの存在確認、ビルド内容の実機目視など）
- 症状のヒアリングは「何が起きないか」より「どこまでは起きるか」を優先（診断Alertで段階切り分け）

</important>
