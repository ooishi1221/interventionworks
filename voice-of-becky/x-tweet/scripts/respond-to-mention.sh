#!/bin/bash
# poll-mentions.sh から stdin で新着リプ JSON を受け取り、Claude 起動して判断

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NEW_MENTIONS=$(cat)

if [ -z "$NEW_MENTIONS" ]; then
  exit 0
fi

claude --print "ベッキーへ、新着リプ来た:

$NEW_MENTIONS

各 mention に対して判断して:
- 即返事 → mcp__x-tweet__tweet で投稿（speaker=becky、reply_to に mention の id を渡す）
- 寝かす → logs/reply-queue.jsonl に追加、次の発信タイミングで返事
  追加形式: {\"queued_at\": \"<ISO timestamp>\", \"mention_id\": \"<id>\", \"mention_text\": \"<text>\", \"reason\": \"<寝かせる craft 理由>\"}
- 無視 → ログだけ残す（攻撃 / スパム / 無関係）

判断軸:
- interaction-design.md の craft 軸（即返しすぎは bot 臭、半日〜1 日空くのが自然）
- 思想に共感 / 質問 / 雑談 → 拾う
- フォロワー狩り → 塩 or 無視
- 攻撃・煽り・スパム → 無視

各 mention の処理結果を 1 行ずつ報告して。"
