# Moto-Logos Slack Bot

## 概要

Slack と Claude Code を双方向で接続するブリッジ。PM2 で常駐化済み。

## 機能

| 機能 | 説明 |
|------|------|
| `/claude <prompt>` | Slack から Claude Code セッションを起動 |
| `@bot mention` | メンションでセッション起動（スレッド内） |
| スレッド返信 | アクティブセッションの Claude stdin に転送 |
| DM | DM でもセッション起動・返信可能 |
| ボタン通知 | `ask-notify.js` でボタン付き質問を送信 |
| ボタン押下 | `claude_choice_*` アクションを受信 → stdin 転送 |

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `src/app.js` | メインBot（Socket Mode）。セッション管理 + ボタンハンドラー |
| `src/notify.js` | 単純テキスト / ボタン付き通知の送信スクリプト |
| `src/ask-notify.js` | Claude Code フック用。`$CLAUDE_TOOL_INPUT` の質問を解析してボタン付き送信 |

## 運用

```bash
# PM2 で常駐起動済み
pm2 status                          # 状態確認
pm2 logs moto-logos-slack-bot       # リアルタイムログ
pm2 restart moto-logos-slack-bot    # 再起動
pm2 stop moto-logos-slack-bot       # 停止
```

## 環境変数（.env）

| 変数 | 用途 |
|------|------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (xoxb-) |
| `SLACK_APP_TOKEN` | App-Level Token (xapp-) — Socket Mode 用 |
| `SLACK_CHANNEL_ID` | 投稿先チャンネル |
| `SLACK_WEBHOOK_URL` | Incoming Webhook（notify.js フォールバック用） |

## Claude Code フック連携

`.claude/settings.json` で以下のイベント時に Slack 通知：

| イベント | 通知内容 |
|---------|---------|
| `AskUserQuestion` | `ask-notify.js` — 質問内容をボタン付きで送信 |
| `Notification` | `notify.js` — テキスト通知 |
| `Stop` | `notify.js` — 作業完了通知 |
