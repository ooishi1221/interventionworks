#!/bin/bash
# launchd で 30 分毎起動、軽量 X API call で新着 mentions チェック
# 新着あれば respond-to-mention.sh に渡して Claude 判断起動

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOGS_DIR="$ROOT/logs"
mkdir -p "$LOGS_DIR"
LOG="$LOGS_DIR/poll.log"

TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S")

# Claude 不使用、軽量 X API polling
NEW=$(npx tsx "$ROOT/scripts/fetch-new-mentions.ts" 2>>"$LOG" || true)

if [ -z "$NEW" ]; then
  echo "[$TIMESTAMP] 新着なし" >> "$LOG"
  exit 0
fi

echo "[$TIMESTAMP] 新着あり、Claude 起動" >> "$LOG"

# 新着あり、Claude 起動して判断委任
echo "$NEW" | "$ROOT/scripts/respond-to-mention.sh" >> "$LOG" 2>&1
