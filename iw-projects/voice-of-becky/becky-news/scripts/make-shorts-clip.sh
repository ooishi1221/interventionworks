#!/bin/bash
# Becky's Cast の1エピソードから見どころ30〜45秒を切り出して縦型(9:16)Shortsをレンダーする。
# 使い方: ./scripts/make-shorts-clip.sh <episode-id> [window_sec] [epLabel] [hook]
#   例:   ./scripts/make-shorts-clip.sh 20260719-220031 40 "#38 月曜日、隣に来た。" 'え、AIってもう"体"に入ってるの!?'
# hook省略時はCastShorts.tsxのデフォルト文言のまま（内容は実素材の切り抜きのみ、演出テロップの文言は毎回目視で決める）
# 縦型は RadioCast.tsx（既存のLive2D縦アバター基盤）を流用したCastShorts.tsxでレンダー。
# 16:9フル尺の単純クロップはロゴ欠けで見送った過去教訓(2026-07-14)があるため使わない。
set -euo pipefail
cd "$(dirname "$0")/.."   # becky-news/

EP_ID="${1:?usage: $0 <episode-id> [window_sec] [epLabel]}"
WINDOW_SEC="${2:-40}"
EPISODES="../becky-cast/episodes.json"
RHUBARB="./spike/Rhubarb-Lip-Sync-1.14.0-macOS/rhubarb"

META=$(python3 - "$EP_ID" "$EPISODES" <<'PY'
import json, sys
ep_id, path = sys.argv[1], sys.argv[2]
eps = json.load(open(path))
ep = next((e for e in eps if e["id"] == ep_id), None)
if ep is None:
    sys.exit(f"episode {ep_id} not found in {path}")
t = ep["title"]
i = t.find("#")
t = t[i:] if i >= 0 else t
t = t.replace(" — ", " ")
print(ep["file"] + "\t" + t)
PY
)
IFS=$'\t' read -r MP3_FILE EP_TITLE <<< "$META"
EP_LABEL="${3:-$EP_TITLE}"
HOOK="${4:-}"
MP3="../becky-cast/out/${MP3_FILE}"
[ -f "$MP3" ] || { echo "mp3 not found: $MP3" >&2; exit 1; }
echo "== episode: $EP_ID / $EP_TITLE"

# 1. フルエピソードの音声/lipsync/RMSが最新かチェック（duration突合）→ 古い/無ければ再生成
MP3_DUR=$(ffprobe -v error -show_entries format=duration -of "default=noprint_wrappers=1:nokey=1" "$MP3")
CUR_DUR=$(python3 -c "import json,sys; print(json.load(open('video/public/lipsync-cast.json'))['metadata']['duration'])" 2>/dev/null || echo "0")
if ! python3 -c "import sys; sys.exit(0 if abs(float('$MP3_DUR') - float('$CUR_DUR')) < 1.0 else 1)"; then
  echo "== フル尺素材が古い/無い → 再生成"
  ffmpeg -y -v error -i "$MP3" -ar 44100 -ac 1 video/public/audio-cast.wav
  "$RHUBARB" -r phonetic -f json -o video/public/lipsync-cast.json video/public/audio-cast.wav
  (cd video && node scripts/build-rms.mjs public/audio-cast.wav public/rms-cast.json)
fi

# 2. 見どころ window を RMS から特定
read -r START END <<< "$(python3 scripts/find_highlight.py video/public/rms-cast.json "$WINDOW_SEC")"
DUR=$(python3 -c "print(round($END - $START, 1))")
echo "== 見どころ: ${START}s 〜 ${END}s（${DUR}s）"

# 3. 音声トリム → Shorts専用の口パク/RMSを作り直す（フル尺のcast-*.jsonは汚さない）
ffmpeg -y -v error -ss "$START" -t "$DUR" -i video/public/audio-cast.wav -ar 44100 -ac 1 video/public/audio-cast-shorts.wav
"$RHUBARB" -r phonetic -f json -o video/public/lipsync-cast-shorts.json video/public/audio-cast-shorts.wav
(cd video && node scripts/build-rms.mjs public/audio-cast-shorts.wav public/rms-cast-shorts.json)

# 4. レンダー
PROPS=$(python3 -c '
import json, sys
props = {"epLabel": sys.argv[1]}
if sys.argv[2]:
    props["hook"] = sys.argv[2]
print(json.dumps(props))
' "$EP_LABEL" "$HOOK")
mkdir -p out/shorts
(cd video && npx remotion render src/index.ts CastShorts --gl=angle --props="$PROPS" --output="../out/shorts/cast-shorts-${EP_ID}.mp4")

echo ""
echo "✅ 完成: $(pwd)/out/shorts/cast-shorts-${EP_ID}.mp4（元: ${START}s-${END}s / ${EP_TITLE}）"
echo "次: フレーム抽出+目視 → 良ければ配信フロー（README）でタイトル付けてYouTube Shorts手動投稿"
