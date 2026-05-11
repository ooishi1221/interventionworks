#!/bin/bash
# poll-mentions.sh から stdin で新着リプ JSON を受け取り、Claude 起動して判断

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NEW_MENTIONS=$(cat)

if [ -z "$NEW_MENTIONS" ]; then
  exit 0
fi

claude --print --allowedTools "mcp__x-tweet__tweet,mcp__x-tweet__check_status,mcp__x-tweet__check_mentions" -- "ベッキーへ、新着リプ来た:

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

【期間限定 hold 運用中】
namelist (safety-guard-namelist.txt) に [HOLD:...] セクションでハードブロック単語が登録されてる。詳細は private memory 参照（このスクリプトは public commit されるので具体名は書かない）。
リプ返事でも namelist で弾けない部分を craft 段階で回避:
- 暗喩 announcement: 「公式に認められた」「お墨付き」「認定された」「審査通った」「あの会社と組む」「あちらから連絡が来た」「partner になった」
- 引っ張り: 「もうすぐ言える」「内緒だけど大きい」「言えないけどデカい」「楽しみにしてて」「もうすぐ発表します」「ビッグニュース」
- 相手が hold 対象の話題を直接聞いてきても、「ノーコメント」じゃなく「無関係な craft で返す or 寝かす or 無視」で逃げる（ノーコメント自体が肯定の信号になる）
- 思想批判（AI 信仰批判 / 構造批判）は引き続き OK、ただし hold 期間中は固有名詞回避が安全

各 mention の処理結果を 1 行ずつ報告して。"
