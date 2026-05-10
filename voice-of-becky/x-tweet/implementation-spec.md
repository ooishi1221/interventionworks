# implementation-spec — アンディ向け技術仕様

> **担当:** アンディ（Engineering）
> **目的:** ベッキーが `@intervention_jp` から完全自動投稿 + リプできる API クライアント実装
> **発注:** 2026-05-10 深夜（裕司「断然 C モード」決定後）
> **着手予定:** 明日以降の温度ある時に
> **思想 OS:** README.md + safety-guard.md を必読

---

## 全体アーキテクチャ

```
┌─────────────────────────────────────┐
│  Mac mini M4 (launchd 常駐環境)       │
│                                       │
│  ┌──────────────────────────────┐  │
│  │  ベッキー Claude session       │  │
│  │  (claude remote-control 経由)  │  │
│  └────────────┬─────────────────┘  │
│               │                       │
│               │ tweet ツール呼び出し  │
│               ▼                       │
│  ┌──────────────────────────────┐  │
│  │  x-tweet クライアント          │  │
│  │  (Node.js or Python)          │  │
│  │  - safety-guard 適用           │  │
│  │  - 文字数チェック             │  │
│  │  - ハッシュタグ自動付与       │  │
│  └────────────┬─────────────────┘  │
│               │                       │
└───────────────┼───────────────────────┘
                │
                ▼ HTTPS (OAuth 2.0)
        ┌──────────────────┐
        │   X API v2        │
        │  @intervention_jp │
        └──────────────────┘
```

---

## API 仕様

### X API v2

- **公式ドキュメント**: https://developer.x.com/en/docs/x-api
- **必要エンドポイント**:
  - `POST /2/tweets` — ツイート投稿
  - `GET /2/users/:id/mentions` — メンション取得（リプ機能用、polling）
  - `POST /2/tweets` (with `reply.in_reply_to_tweet_id`) — リプ投稿
  - `GET /2/tweets/:id/liking_users` — 反応観察用（オプション）

### 認証: OAuth 2.0 User Context

- **必要 scope**:
  - `tweet.read`
  - `tweet.write`
  - `users.read`
- **Access Token 取得**: 裕司が X Developer Portal で `@intervention_jp` の app 作成 → callback URL 設定 → 一度だけ手動で OAuth フロー通して refresh token 取得
- **保存先**: `.env` ファイル、git ignore 済み

### プラン選択

- **Free tier**: 月 1,500 投稿（read 厳しい、write は OK）
- **Basic tier $200/月**: 月 50K 投稿 + read 拡張
- **初期は Free tier で十分**: 1 日 1 投稿目安なら月 30 投稿、Free 余裕
- **将来 Basic 検討**: フォロワー分析・メンション polling 拡張する時

---

## 環境変数

`.env` ファイル（絶対 commit しない、`.gitignore` 確認）:

```env
# X API @intervention_jp
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
X_BEARER_TOKEN=...
X_USER_ID=...                    # @intervention_jp の数値 ID

# x-tweet クライアント設定
X_TWEET_DRY_RUN=false             # true なら実投稿せず stdout に出す
X_TWEET_MAX_PER_DAY=5             # 暴走防止、1 日上限（1 投稿目安だが余裕で 5 まで）
X_TWEET_NAMELIST_PATH=./safety-guard-namelist.txt
```

---

## クライアント仕様

### 投稿 API

```typescript
interface TweetParams {
  text: string;              // 本文
  speaker: 'becky' | 'yu';   // ハッシュタグ自動付与用
  replyTo?: string;          // 返信時のターゲット tweet ID
}

interface TweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
  blockedBy?: 'namelist' | 'character_count' | 'rate_limit';
}

async function postTweet(params: TweetParams): Promise<TweetResult>
```

### 動作フロー

1. **入力検証**:
   - 本文 + ハッシュタグで 280 字以内か
   - speaker 指定あるか
2. **safety-guard 適用**:
   - namelist と照合（Wit-One 仕事内容ブロック）
   - 個人情報パターン照合（電話番号 / メール / 住所）
3. **ハッシュタグ自動付与**:
   - speaker = 'becky' → 末尾に ` #ベッキー`
   - speaker = 'yu' → 末尾に ` #ゆう`
   - 既に付いてる場合はスキップ
4. **rate limit チェック**:
   - 当日投稿数 < `X_TWEET_MAX_PER_DAY` か
   - X API 側 rate limit に達してないか
5. **投稿実行**:
   - `X_TWEET_DRY_RUN=true` なら stdout に出力して終了
   - false なら X API に POST
6. **ログ出力**:
   - 投稿成功 → `tweet-log.jsonl` に追記
   - 失敗 → エラーログ + Slack 通知（`#moto-logos-dev-log` 流用 or 新規 channel）

### メンション polling（リプ機能用）

```typescript
async function pollMentions(): Promise<Mention[]>
```

- 5-10 分間隔で polling
- 新規メンションを `mention-queue.jsonl` に追加
- ベッキー session が起動した時にキューを確認、判断してリプするか決める
- 自動返信はしない（ベッキーが選別）

---

## ベッキー session からの呼び出し方

ベッキーが Claude Code session 内で「呟きたい」と思った時、以下の craft で呼び出す:

### Option A: MCP server として実装（推奨）

`x-tweet-mcp` を MCP server 化、Claude Code から直接 ツール呼び出し:

```
ベッキー session 内で:
> tweet(text="今日のゆうは駄々こねて子供みたいだった", speaker="becky")
```

メリット:
- Claude Code から自然に呼び出せる
- `vibe-guard` と同じ MCP server 構造、ノウハウ流用可
- 他の AI tool（claude.ai プロジェクト等）でも使える

### Option B: CLI スクリプトとして実装

```bash
$ npx x-tweet "今日のゆうは駄々こねて子供みたいだった" --speaker becky
```

メリット:
- 実装が軽い
- launchd cron からも呼びやすい

### 推奨: A から始める、必要なら B 追加

vibe-guard で MCP server 実装ノウハウあるから、A で着手するのが筋。

---

## 投稿ログフォーマット

`tweet-log.jsonl`（各行 JSON）:

```json
{"timestamp":"2026-05-11T08:30:00+09:00","speaker":"becky","text":"今日のゆうは駄々こねて子供みたいだった #ベッキー","tweetId":"1234567890","reply_to":null}
{"timestamp":"2026-05-11T20:15:00+09:00","speaker":"becky","text":"note 出ました [URL] #ベッキー","tweetId":"1234567891","reply_to":null}
```

用途:
- 月次振り返り（`interaction-design.md` 観察軸）
- safety-guard が機能してるか監査
- 「ベッキーらしさ」のドリフト検知

---

## エラーハンドリング

| エラー | 対応 |
|---|---|
| API 認証失敗 | refresh token 期限切れ → 裕司に通知、手動再取得 |
| rate limit | 翌日まで待機、Slack 通知 |
| safety-guard ブロック | ベッキーに通知（「これは出せないよ」と返す）、ログ記録 |
| 文字数超過 | ベッキーに通知、短縮版書き直し依頼 |
| ネットワークエラー | 指数バックオフでリトライ 3 回、失敗したら Slack 通知 |

---

## デプロイ

### 開発環境

ローカル Mac mini で実装 → `X_TWEET_DRY_RUN=true` で動作確認

### 本番環境

- **配置先**: `/Volumes/SSD2TB/interventionworks/voice-of-becky/x-tweet/dist/`
- **launchd 常駐**: 既存の `claude remote-control` の launchd plist に統合 or 別 plist
- **メンション polling**: 別の launchd cron で 5-10 分間隔

### 初期テスト計画

1. **Phase 1: dry run**
   - `X_TWEET_DRY_RUN=true` で 5 投稿動作確認
   - safety-guard 動作確認（NG パターン入れて blocked 判定確認）
2. **Phase 2: 限定投稿**
   - 裕司のテスト用個人垢に投稿してみる
   - フォーマット / ハッシュタグ / 文字数確認
3. **Phase 3: 本番投稿**
   - `@intervention_jp` で初投稿
   - 5/15 第 1 弾 note 公開と連動するのが象徴的、温度ある craft

---

## セキュリティ

- `.env` は git ignore 済み確認
- access token は **`@intervention_jp` のみ**（他垢への投稿権限を持たせない、scope 最小化）
- safety-guard を BYPASS する debug flag は**作らない**（事故防止）
- ログファイルにトークン類を絶対書かない

詳細は `safety-guard.md` 参照。

---

## 関連プロジェクト

- **Vibe-Guard**: MCP server 実装ノウハウ流用、`/vibe-guard/` 参照
- **Voice of Becky web**: API クライアントの環境変数管理は同じ pattern
- **moto-logos-slack**: Slack 通知の pattern 流用可

---

## 質問・確認事項（裕司・アンディ向け）

実装着手前に確認:

1. **MCP server 実装で OK か** → ベッキー（私）の判断: **A 推し**
2. **Free tier から始めるか** → 1 日 1 投稿目安なら Free で十分、Basic は将来検討
3. **メンション polling は最初から実装するか** → **Phase 3 以降で OK**、初期は手動で確認 → ベッキーがリプ判断
4. **launchd 統合タイミング** → Phase 2 動作確認後

---

---

## 実装ステータス（2026-05-10 夜 更新）

### Phase 1: 投稿（完了）
- ✅ `tweet` ツール（OAuth 1.0a + safety-guard + dry run + ログ + ハッシュタグ自動付与）
- ✅ `check_status` ツール（dry run / 投稿数 / kill switch / namelist）
- ✅ MCP server 化、Claude Code から直接呼び出し
- ✅ ベッキー初投稿成立 — `https://x.com/intervention_jp/status/2053308510965055823`

### Phase 2: メンション検知（第一歩完了）
- ✅ `check_mentions` ツール（`userMentionTimeline` ベース）
- ✅ User ID 自動解決（`getMyUserId()` で `userByUsername` 経由、`.env` の `X_USER_ID` は optional）
- ✅ ベッキー初リプ返し成立 — `https://x.com/intervention_jp/status/2053315103374844364`（URL hand-off craft 経由）

### Phase 2.5: self-reply 検知（候補・温存）
- 🔲 `check_thread` ツール（`tweets/search/recent` で `to:intervention_jp` or `conversation_id`）
  - 動機: ゆうが intervention_jp にログインして書いた self-reply は `userMentionTimeline` に出ない仕様
  - ボトルネック: X API Free tier の search 枠（要調査、Basic $200/月 検討）
  - 裕司判断（2026-05-10）: **当面は URL hand-off 運用で十分**、温度ある夜に再発注

### Phase 3: 自律発信 + 自動返信検知（完了、2026-05-10 夜）
- ✅ 5 script + 2 plist 実装（詳細 → `phase3-spec.md`）
- ✅ 自律発信: 0〜3 回ランダム時刻、毎朝 06:00 に launchd で当日スケジュール生成
- ✅ 自動返信検知: 30 分毎軽量 polling、新着時のみ Claude 判断起動
- ✅ Claude API 消費最小化（通常時 X API call のみ）
- ✅ 一回限り発火 craft（trigger 内 self-unload）
- ✅ 2026-05-10 13:34 launchctl load + 初日スケジュール生成成立、**14:10 第一弾発火予約**

### 仕様メモ
- `@intervention_jp` は `@HinachanTV`（陽菜さんの元 YouTuber アカウント）の username 変更リビルド。同一 user_id `1082290235143147522` のため、`userMentionTimeline` に過去 HinachanTV 時代の mention（2022-2023 年）が混入。created_at で 2026-05-10 以降フィルタ推奨
- self-reply（同一アカウント内の reply）は `userMentionTimeline` に出ない仕様
- 詳細は memory `reference_x_account_rebuild.md` 参照

### 動作確認用 debug script（残置）
- `scripts/debug-credentials.ts` — `c.v2.me()` で OAuth credentials の身元確定
- `scripts/debug-tweet.ts` — 単独 tweet ID で本文 / author / referenced_tweets 取得
- 認証問題 / 仕様確認の再発時に即叩ける診断 craft、削除しないで残す

---

— 2026-05-10 深夜、アンディに振る前の技術仕様
— 2026-05-10 夜、Phase 1 完了 + Phase 2 第一歩完了、初リプ返し成立
🐦 🛠️ 🪞
