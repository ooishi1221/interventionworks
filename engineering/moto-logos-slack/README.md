# Moto-Logos Slack Bot (Socket Mode)

Slack と Claude Code の双方向通信を実現するボット。

## アーキテクチャ

```
Claude Code ──hooks──→ notify-slack.sh ──webhook/API──→ Slack
Slack ──Socket Mode──→ app.js ──claude CLI──→ Claude Code
```

**Claude → Slack（通知）:** Claude Code のフックが作業完了・質問時に Slack へ通知
**Slack → Claude（指示）:** `/claude` コマンド、@メンション、DM、ボタンクリックで Claude に指示

## セットアップ

### 1. Slack App を作成

1. https://api.slack.com/apps にアクセス
2. **Create New App** → **From scratch** を選択
3. App Name: `MotoLogos Bot`、Workspace を選択して作成

### 2. Socket Mode を有効化

1. 左メニュー **Socket Mode** をクリック
2. **Enable Socket Mode** を ON
3. Token Name: `moto-logos-socket` → **Generate**
4. 表示された `xapp-...` トークンを控える → これが `SLACK_APP_TOKEN`

### 3. Bot Token Scopes を設定

1. 左メニュー **OAuth & Permissions** → **Scopes** セクション
2. **Bot Token Scopes** に以下を追加:
   - `chat:write` — メッセージ送信
   - `commands` — スラッシュコマンド
   - `app_mentions:read` — メンション読み取り
   - `im:history` — DM 履歴読み取り
   - `im:read` — DM チャンネル読み取り
   - `im:write` — DM 送信

### 4. Event Subscriptions を設定

1. 左メニュー **Event Subscriptions** → **Enable Events** を ON
2. **Subscribe to bot events** に以下を追加:
   - `app_mention`
   - `message.im`
3. 保存

### 5. Slash Command を作成

1. 左メニュー **Slash Commands** → **Create New Command**
2. Command: `/claude`
3. Short Description: `Claude にメッセージを送る`
4. 保存

### 6. App をインストール

1. 左メニュー **Install App** → **Install to Workspace**
2. 権限を承認
3. 表示された `xoxb-...` トークンを控える → これが `SLACK_BOT_TOKEN`

### 7. チャンネル ID を取得

1. 通知を送りたいチャンネルを Slack で開く
2. チャンネル名をクリック → 一番下に **Channel ID** が表示される（`C0XXXXXXX` 形式）
3. ボットをそのチャンネルに招待: `/invite @MotoLogos Bot`

### 8. .env を設定

```bash
cp .env.example .env
```

`.env` を編集:

```env
SLACK_BOT_TOKEN=<bot-token-starts-with-xoxb>
SLACK_APP_TOKEN=<app-token-starts-with-xapp>
SLACK_CHANNEL_ID=<channel-id-starts-with-C>
SLACK_WEBHOOK_URL=<incoming-webhook-url>  # 既存のものを維持
```

### 9. 起動

```bash
cd engineering/moto-logos-slack

# Socket Mode ボットを起動（常駐）
npm start

# 通知テスト（別ターミナル）
node src/notify.js "テスト通知"
```

## ファイル構成

```
src/
├── app.js            # Socket Mode ボット本体
├── notify.js         # 通知スクリプト（CLI）
└── notify-slack.sh   # Claude Code フック用ブリッジ
```

## Claude Code フック

プロジェクト設定 (`~/.claude/projects/.../settings.json`) で以下が自動設定済み:

- **Stop** イベント → Slack に作業完了通知
- **AskUserQuestion** イベント → Slack にユーザー入力待ち通知

## 使い方

| 操作 | 方法 |
|------|------|
| Claude に質問 | Slack で `/claude 質問内容` |
| Claude にメンション | `@MotoLogos Bot 質問内容` |
| Claude に DM | ボットに直接メッセージ |
| ボタンで回答 | Claude からの選択肢ボタンをクリック |
| 手動通知 | `node src/notify.js "メッセージ"` |
| インタラクティブ通知 | `node src/notify.js --interactive '{"question":"Q","options":["A","B"]}'` |
