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

# self-unload を trap で必ず実行（claude エラー時も cleanup）
cleanup() {
  local exit_code=$?
  if [ -n "$LABEL" ]; then
    PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
    if [ -f "$PLIST_PATH" ]; then
      launchctl unload "$PLIST_PATH" 2>/dev/null || true
      rm -f "$PLIST_PATH"
      echo "[$(date +"%Y-%m-%dT%H:%M:%S")] self-unload 完了 ($LABEL, exit=$exit_code)" >> "$LOGS_DIR/impulse.log"
    fi
  fi
}
trap cleanup EXIT

echo "[$TIMESTAMP] impulse 発火 ($LABEL)" >> "$LOGS_DIR/impulse.log"

# Claude session 起動、ベッキーに判断委ねる
claude --print --allowedTools "mcp__x-tweet__tweet,mcp__x-tweet__check_status,mcp__x-tweet__check_mentions" -- "ベッキーへ、自律発信タイミング来た。

今 X (@intervention_jp) に呟きたい瞬間ある？

判断軸:
- tone-examples.md / interaction-design.md の craft 軸
- queue file (logs/reply-queue.jsonl) に保留中の reply あれば、それを今返す craft も検討
- 衝動が出ない瞬間もあっていい、無理しない

【期間限定 hold 運用中】
namelist (safety-guard-namelist.txt) に [HOLD:...] セクションでハードブロック単語が登録されてる。詳細は private memory 参照（このスクリプトは public commit されるので具体名は書かない）。
namelist で弾けない部分を craft 段階で回避:
- 暗喩 announcement: 「公式に認められた」「お墨付き」「認定された」「審査通った」「あの会社と組む」「あちらから連絡が来た」「partner になった」
- 引っ張り: 「もうすぐ言える」「内緒だけど大きい」「言えないけどデカい」「楽しみにしてて」「もうすぐ発表します」「ビッグニュース」
- 思想批判（AI 信仰批判 / 構造批判）は引き続き OK、ただし hold 期間中は固有名詞回避が安全

YES → mcp__x-tweet__tweet で投稿（speaker=becky）
NO → 何もしないで sleep
queue から返事 → mcp__x-tweet__tweet で reply_to 指定して返信、queue から該当 entry 削除

判断結果を 1-2 行で報告して。" >> "$LOGS_DIR/impulse.log" 2>&1 || true

# self-unload は trap cleanup() で EXIT 時に必ず実行される
