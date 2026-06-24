#!/bin/bash
# meeting-ai 起動スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# WhisperX 専用 venv（Python 3.12 必須。voice-of-becky の 3.14 venv では動かない）
PYTHON="$SCRIPT_DIR/.venv-whisperx/bin/python3"
LOG_FILE="$SCRIPT_DIR/../whisper_server.log"

# HF_TOKEN が設定されていれば話者分離 ON（未設定でも動く）
# export HF_TOKEN=your_token_here  # 必要なら .env や shell profile に設定

# 既存の Whisper プロセスを止める
OLD_PID=$(lsof -ti :8767 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "[start.sh] Killing existing Whisper process (PID: $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 1
fi

echo "[start.sh] Starting WhisperX server (diarization: ${HF_TOKEN:+ON}${HF_TOKEN:-OFF})..."
PYTHONUNBUFFERED=1 "$PYTHON" -u "$SCRIPT_DIR/whisper_server.py" > "$LOG_FILE" 2>&1 &
WHISPER_PID=$!

echo "[start.sh] Waiting for model to load (20s)..."
sleep 20
echo "[start.sh] Starting Next.js dev server..."
cd "$SCRIPT_DIR/.." && npm run dev

kill $WHISPER_PID 2>/dev/null
