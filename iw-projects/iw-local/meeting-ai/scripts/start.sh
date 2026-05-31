#!/bin/bash
# meeting-ai 起動スクリプト
# whisper サーバー (ポート 8767) を起動してから Next.js dev server を立ち上げる

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON=/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge/.venv/bin/python3

echo "[start.sh] Starting Whisper server..."
"$PYTHON" "$SCRIPT_DIR/whisper_server.py" &
WHISPER_PID=$!
echo "[start.sh] Whisper server started (PID: $WHISPER_PID)"

# whisper サーバーの起動を少し待つ
sleep 2

echo "[start.sh] Starting Next.js dev server..."
npm run dev

# Next.js が終了したら whisper も止める
kill $WHISPER_PID 2>/dev/null
