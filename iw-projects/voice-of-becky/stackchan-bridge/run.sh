#!/bin/bash
VENV="$(dirname "$0")/.venv"
# avatar_set の配信は capture_server (8766) が担うので、ESP32 への通知ポートも 8766 に揃える。
# これを渡さないと gateway.py が WS ポート(8765)へフォールバックし、ESP32 が HTTP GET に失敗する(http_open_failed)。
export AVATAR_SET_PORT="${AVATAR_SET_PORT:-8766}"
export VISION_HOST="${VISION_HOST:-192.168.68.60}"
exec "$VENV/bin/python3" -m stackchan_mcp
