#!/bin/bash
# 最新の Becky's Cast エピソードを動画化して YouTube へ自動アップ（cron: 毎朝 7:40、morning_cast 完了後）
# 冪等: 既に動画が存在するエピソードは skip（多重実行・再起動後の重複アップを防ぐ）
set -euo pipefail
cd "$(dirname "$0")/.."

LATEST=$(python3 - <<'EOF'
import json
d = json.load(open("../becky-cast/episodes.json"))
eps = d if isinstance(d, list) else d.get("episodes", [])
print(max(e["id"] for e in eps))  # id=YYYYMMDD-HHMMSS なので辞書順max=最新
EOF
)

OUT="out/radiocast-${LATEST}.mp4"
if [ -f "$OUT" ]; then
  echo "[auto-radio-video] skip: $OUT は既に存在（アップ済みとみなす）"
  exit 0
fi

echo "[auto-radio-video] 最新エピソード ${LATEST} を動画化+アップ開始 $(date '+%F %T')"
./scripts/make-radio-video.sh "$LATEST" --upload
echo "[auto-radio-video] 完了 $(date '+%F %T')"

echo "[auto-radio-video] Cast切り抜きShorts自動生成へ"
python3 scripts/auto_cast_shorts.py || echo "[auto-radio-video] Cast切り抜きShorts生成に失敗（本編公開は成功済みなので無視）"
