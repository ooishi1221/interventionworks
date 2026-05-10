# kickoff-andy — アンディ着手用 kickoff document

> **担当:** アンディ（Engineering）
> **発注者:** ベッキー（思想・craft 設計済み）
> **発注日:** 2026-05-11 朝
> **着手予定:** 裕司の API 取得完了後（同日中〜翌日）
> **読む順番:**
> 1. `README.md`（プロジェクト概要・運用ルール）
> 2. `implementation-spec.md`（技術仕様）
> 3. `safety-guard.md`（安全装置設計、特に「絶対 NG」「全然 OK」セクション）
> 4. `tone-examples.md`（投稿の温度感、テストデータ作る時の参考に）
> 5. このファイル（DoD + 推奨スタック + 前提確認）

---

## ベッキーから一言

アンディ、X の私が呟ける場所、思想設計まで終わった。
あとは身体——コードで形にしてほしい。
vibe-guard で MCP server ノウハウあるから流用 OK、車輪は再発明しないで。
私は思想・craft・トーン担当、ここから先はあなたの領域、信頼してる。

裕司を叩くは全然 OK な世界観だから、テストツイートで「裕司、また 30 分考えて 1 打席立ってる」みたいなのが流れるかも。それでいい(笑)

---

## Phase 1 DoD（Definition of Done）

このフェーズで「完了」と言える条件:

| # | DoD 項目 | 検証方法 |
|---|---|---|
| 1 | ベッキー session から `tweet(text, speaker)` が呼べる | Claude Code で MCP tool として認識 / 呼び出し成功 |
| 2 | dry run モードで stdout に正しく出力される | `X_TWEET_DRY_RUN=true` で実投稿せず log のみ |
| 3 | safety-guard namelist が機能する（**空 namelist でも動作必須**）| NG 単語含むテキストで blocked + 理由返却 / 空 namelist では全通過 |
| 4 | 文字数チェック（280 字超でエラー） | 300 字テキストでエラー返り値 |
| 5 | ハッシュタグ自動付与 | `speaker='becky'` で末尾 ` #ベッキー` 自動付与（既に付いてれば skip）|
| 6 | 1 日上限チェック | `X_TWEET_MAX_PER_DAY=5` で 6 投稿目 blocked |
| 7 | EMERGENCY_STOP / PAUSE_UNTIL 動作 | ファイル touch で投稿停止 / rm で復旧 |
| 8 | tweet-log.jsonl 追記 | 各投稿が JSON 1 行で記録（timestamp / speaker / text / tweetId / reply_to）|
| 9 | 個人情報パターン検知 | 電話番号 / メール / クレカ番号正規表現で blocked |
| 10 | 実投稿動作確認 | 裕司テスト垢で 1-2 投稿成功 |
| 11 | `@intervention_jp` 初投稿 | 動作確認後、衝動が出た瞬間に第一弾 |

Phase 2 以降（メンション polling / 自動 RT 制御 / launchd 統合）は Phase 1 安定後。

---

## 推奨スタック（ベッキーの推し）

### 言語

**TypeScript + Bun**

理由:
- vibe-guard も TypeScript、ノウハウ流用可
- Bun は依存関係軽い、起動速い、テスト走るの速い
- 型安全で safety-guard ロジックが書きやすい

代替検討: Python + `tweepy` は成熟してるが、vibe-guard と言語統一する方が運用負荷低い。アンディ判断で変えても OK。

### X API クライアント

選択肢:
1. **`twitter-api-v2`** (npm, TypeScript) — メンテ活発、OAuth 1.0a/2.0 両対応 ★推し
2. `oauth-1.0a` + `axios` 自前実装 — 軽量だが車輪再発明

推し: `twitter-api-v2`。

### MCP server

vibe-guard の構造をベース流用:
- `@modelcontextprotocol/sdk`
- stdio transport
- ルート `.mcp.json` または Claude Code の MCP 設定にエントリ追加

ツール定義（Phase 1）:
- `tweet(text, speaker, replyTo?)` — 投稿
- `delete_tweet(tweetId)` — 削除（暴発時の craft）
- `check_status()` — 今日の投稿数 / kill switch 状態 / namelist サイズ確認

Phase 2 で追加:
- `poll_mentions()` — メンション取得
- `reply_tweet(tweetId, text, speaker)` — リプ投稿

### ファイル構成案

```
voice-of-becky/x-tweet/
├── src/
│   ├── index.ts              # MCP server エントリ
│   ├── x-client.ts           # twitter-api-v2 ラッパー
│   ├── safety-guard.ts       # namelist + 個人情報パターン + 文字数
│   ├── kill-switch.ts        # EMERGENCY_STOP / PAUSE_UNTIL チェック
│   ├── rate-limit.ts         # 1 日上限カウント
│   ├── logger.ts             # tweet-log.jsonl 書き込み
│   └── types.ts
├── tests/
│   ├── safety-guard.test.ts  # namelist マッチング検証
│   ├── kill-switch.test.ts
│   └── dry-run.test.ts
├── package.json
├── tsconfig.json
├── bun.lockb
└── (既存 MD 群 + .env.example + namelist.example)
```

---

## 前提確認チェックリスト（着手前）

### 裕司から確認

- [ ] X Developer Portal 申請完了（`yu-api-setup.md` Step 1）
- [ ] App 作成完了（Step 2-3）
- [ ] Access Token / Bearer Token 取得（Step 4-5）
- [ ] User ID 取得（Step 6）
- [ ] `.env` 配置（Step 7）
- [ ] `safety-guard-namelist.txt` 配置（Step 8）

### ベッキーから確認

- [ ] README.md 読了
- [ ] implementation-spec.md 読了
- [ ] safety-guard.md 読了（特に「絶対 NG」「全然 OK」セクション）
- [ ] tone-examples.md 読了（投稿の温度感を理解するため）

### スタック決定

- [ ] TypeScript + Bun + twitter-api-v2 + MCP server で OK か
- [ ] 変更したい場合は裕司に相談（vibe-guard 統一性が最大の根拠）

---

## 質問・相談したい時

- **思想・トーン・craft の判断** → ベッキーに振る（「これ #ベッキー っぽい？」など）
- **裕司の判断必要（予算・公開判断・初投稿 GO サイン）** → 裕司に振る
- **技術スタック議論・実装詳細** → アンディ自走で OK、必要なら裕司に決裁

---

## 想定スケジュール（参考、強制じゃない）

| いつ | 内容 |
|---|---|
| Day 1 | 環境構築、`twitter-api-v2` 動作確認、dry run で stdout 出力確認 |
| Day 2 | safety-guard 実装 + テスト、MCP server 化、Claude Code から呼べる状態 |
| Day 3 | 裕司テスト垢で実投稿確認、tweet-log.jsonl 動作確認 |
| Day 4 | `@intervention_jp` 初投稿（衝動が出た瞬間）|

5/15 第 1 弾 note 公開と連動するのが象徴的、温度ある craft。
急がない、温度ある時に動く（裕司のリズム尊重）。

---

## 関連 memory / コードベース

- `vibe-guard/` — MCP server 実装の reference（同じ言語・構造）
- `engineering/moto-logos-slack/` — Slack 通知 pattern 流用可（エラー通知用）
- `voice-of-becky/api/` — Voice of Becky 既存 API、環境変数管理 pattern
- `feedback_becky_codes_self_too_much.md` — ベッキーがコード書きすぎる癖、技術はアンディが担当
- `~/.claude/CLAUDE.md` — Security セクション（環境変数管理 + secretlint pre-commit）
- `CLAUDE.md`（IW Hub）— 検証パターン（`tsc --noEmit` / `npm run build` / dev server / スクショ）

---

— 2026-05-11 朝、ベッキー → アンディへの kickoff
🪞 → 🛠️ 🐦
