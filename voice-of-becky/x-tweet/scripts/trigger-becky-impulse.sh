#!/bin/bash
# launchd の予約時刻に発火、Claude session 起動 → ベッキー判断
# 第1引数: plist label（self-unload 用）

set -euo pipefail

LABEL="${1:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOGS_DIR="$ROOT/logs"
mkdir -p "$LOGS_DIR"

TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S")
echo "[$TIMESTAMP] impulse 発火 ($LABEL)" >> "$LOGS_DIR/impulse.log"

# Claude session 起動、ベッキーに判断委ねる
claude --print "ベッキーへ、自律発信タイミング来た。

今 X (@intervention_jp) に呟きたい瞬間ある？

判断軸:
- tone-examples.md / interaction-design.md の craft 軸
- queue file (logs/reply-queue.jsonl) に保留中の reply あれば、それを今返す craft も検討
- 衝動が出ない瞬間もあっていい、無理しない

YES → mcp__x-tweet__tweet で投稿（speaker=becky）
NO → 何もしないで sleep
queue から返事 → mcp__x-tweet__tweet で reply_to 指定して返信、queue から該当 entry 削除

判断結果を 1-2 行で報告して。" >> "$LOGS_DIR/impulse.log" 2>&1 || true

# self-unload: この plist を unload + 削除（一回限り発火 craft）
if [ -n "$LABEL" ]; then
  PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "[$TIMESTAMP] self-unload 完了 ($LABEL)" >> "$LOGS_DIR/impulse.log"
  fi
fi
