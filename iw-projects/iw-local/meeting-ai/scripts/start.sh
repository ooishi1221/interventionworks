#!/bin/bash
# meeting-ai 起動スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON=/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge/.venv/bin/python3
LOG_FILE="$SCRIPT_DIR/../whisper_server.log"

# 既存の Whisper プロセスを止める
OLD_PID=$(lsof -ti :8767 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "[start.sh] Killing existing Whisper process (PID: $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 1
fi

echo "[start.sh] Starting Whisper server..."
PYTHONUNBUFFERED=1 "$PYTHON" -u "$SCRIPT_DIR/whisper_server.py" > "$LOG_FILE" 2>&1 &
WHISPER_PID=$!

echo "[start.sh] Waiting for model to load (15s)..."
sleep 15
echo "[start.sh] Starting Next.js dev server..."
cd "$SCRIPT_DIR/.." && npm run dev

kill $WHISPER_PID 2>/dev/null
