#!/bin/bash
# 透過立ち絵素材パックを全表情まとめて焼く（サムネ合成用、becky-craft/scripts/record-episode.py
# make_thumbnail() の becky_png 差し込み口向け）。動画じゃない、1フレームだけの static PNG。
# 使い方: ./scripts/render-portraits.sh   （表情を増やしたら下の EXPRESSIONS と Root.tsx に追記）
set -euo pipefail
cd "$(dirname "$0")/.."   # becky-news/

OUT="out/portraits"
mkdir -p "$OUT"

# ponytail: macOS標準bash(3.2)は連想配列非対応 → "表情名:Composition ID" の単純リストで回す
EXPRESSIONS="idle:PortraitIdle egao:PortraitEgao komarigao:PortraitKomarigao"

for pair in $EXPRESSIONS; do
  name="${pair%%:*}"
  comp="${pair##*:}"
  echo "== $comp -> $OUT/becky-portrait-${name}.png"
  (cd video && npx remotion still src/index.ts "$comp" "../$OUT/becky-portrait-${name}.png" --gl=angle)
done
echo "done: $OUT"
