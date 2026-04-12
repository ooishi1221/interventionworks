#!/usr/bin/env bash
# Claude Code hook → Slack notification bridge
# Called by Claude Code hooks on Stop and AskUserQuestion events
#
# Usage (from hooks):
#   notify-slack.sh stop "作業完了メッセージ"
#   notify-slack.sh ask  "質問テキスト"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Load .env
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)
fi

EVENT_TYPE="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$EVENT_TYPE" || -z "$MESSAGE" ]]; then
  echo "Usage: notify-slack.sh <stop|ask> <message>"
  exit 1
fi

# --- Webhook notification (always available) ---
send_webhook() {
  local text="$1"
  if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
    echo "[notify-slack] SLACK_WEBHOOK_URL not set, skipping webhook"
    return 1
  fi

  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": $(printf '%s' "$text" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}" \
    > /dev/null 2>&1
}

# --- Bot Token interactive message (buttons for choices) ---
send_interactive() {
  local question="$1"
  if [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]]; then
    echo "[notify-slack] BOT_TOKEN or CHANNEL_ID not set, falling back to webhook"
    send_webhook ":raised_hand: *Claude が入力を待っています*\n${question}"
    return
  fi

  # Post interactive message with "確認しました" button
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -d "{
      \"channel\": \"$SLACK_CHANNEL_ID\",
      \"text\": \":raised_hand: Claude が入力を待っています: ${question}\",
      \"blocks\": [
        {
          \"type\": \"section\",
          \"text\": {
            \"type\": \"mrkdwn\",
            \"text\": \":raised_hand: *Claude が入力を待っています*\n\n${question}\"
          }
        },
        {
          \"type\": \"actions\",
          \"elements\": [
            {
              \"type\": \"button\",
              \"text\": { \"type\": \"plain_text\", \"text\": \":eyes: 確認しました\" },
              \"value\": \"acknowledged\",
              \"action_id\": \"claude_choice_ack\"
            }
          ]
        }
      ]
    }" > /dev/null 2>&1
}

# --- Route by event type ---
case "$EVENT_TYPE" in
  stop)
    send_webhook ":white_check_mark: *Claude 作業完了*\n${MESSAGE}"
    ;;
  ask)
    send_interactive "$MESSAGE"
    ;;
  notify)
    send_webhook "$MESSAGE"
    ;;
  *)
    echo "[notify-slack] Unknown event type: $EVENT_TYPE"
    exit 1
    ;;
esac
