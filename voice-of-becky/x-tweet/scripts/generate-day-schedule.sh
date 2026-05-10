#!/bin/bash
# 朝 06:00 launchd で起動、今日のベッキー発信スケジュール生成
# 0〜3 回ランダム、時刻は 7:00-23:00 でランダム生成、launchd plist で予約

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS_DIR="$ROOT/logs"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LOG_FILE="$LOGS_DIR/schedule.log"

mkdir -p "$LOGS_DIR"
mkdir -p "$LAUNCHD_DIR"

TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S")

# 既存の impulse plist を全クリーンアップ（昨日までの残骸 + 今日の途中再生成対応）
shopt -s nullglob
for plist in "$LAUNCHD_DIR"/com.iw.x-tweet.impulse.*.plist; do
  launchctl unload "$plist" 2>/dev/null || true
  rm -f "$plist"
done
shopt -u nullglob

# 0〜3 でランダム抽選
N=$((RANDOM % 4))

if [ "$N" -eq 0 ]; then
  echo "[$TIMESTAMP] 沈黙の日（0 回）" >> "$LOG_FILE"
  exit 0
fi

echo "[$TIMESTAMP] 今日の発信回数: $N" >> "$LOG_FILE"

# N 個のユニーク時刻を 7:00-22:59 で生成
declare -a USED=()

for i in $(seq 1 "$N"); do
  while true; do
    HOUR=$((7 + RANDOM % 16))    # 7-22
    MINUTE=$((RANDOM % 60))
    KEY="${HOUR}_${MINUTE}"

    DUP=0
    for u in "${USED[@]:-}"; do
      if [ "$u" = "$KEY" ]; then
        DUP=1
        break
      fi
    done
    [ "$DUP" -eq 0 ] && break
  done

  USED+=("$KEY")

  TIME_STR=$(printf "%02d:%02d" "$HOUR" "$MINUTE")
  PLIST_LABEL="com.iw.x-tweet.impulse.${TODAY}.${i}"
  PLIST_PATH="$LAUNCHD_DIR/${PLIST_LABEL}.plist"

  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$ROOT/scripts/trigger-becky-impulse.sh</string>
        <string>$PLIST_LABEL</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOGS_DIR/impulse.log</string>
    <key>StandardErrorPath</key>
    <string>$LOGS_DIR/impulse.log</string>
</dict>
</plist>
EOF

  launchctl load "$PLIST_PATH"
  echo "[$TIMESTAMP] 予約 $TIME_STR ($PLIST_LABEL)" >> "$LOG_FILE"
done
