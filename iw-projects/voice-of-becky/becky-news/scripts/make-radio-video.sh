#!/bin/bash
# Becky's Cast ラジオ動画を1コマンドで作る。
# 使い方: ./scripts/make-radio-video.sh <episode-id> [--upload]   例: 20260705-220031
# mp3→wav → Rhubarb(-r phonetic) → RMS → Remotion レンダー（RadioCastWarm, --gl=angle 必須）
# --upload: レンダー後に YouTube へ自動アップ（初回のみ scripts/SETUP-youtube-upload.md）
set -euo pipefail
cd "$(dirname "$0")/.."   # becky-news/

EP_ID="${1:?usage: $0 <episode-id> [--upload]  (episodes.json の id、例: 20260705-220031)}"
UPLOAD="${2:-}"
EPISODES="../becky-cast/episodes.json"
RHUBARB="./spike/Rhubarb-Lip-Sync-1.14.0-macOS/rhubarb"

# 1. episodes.json からメタ取得（file \t 画面用タイトル \t YouTube用タイトル）
META=$(python3 - "$EP_ID" "$EPISODES" <<'PY'
import json, re, sys
ep_id, path = sys.argv[1], sys.argv[2]
eps = json.load(open(path))
ep = next((e for e in eps if e["id"] == ep_id), None)
if ep is None:
    sys.exit(f"episode {ep_id} not found in {path}")
t = ep["title"]
i = t.find("#")
t = t[i:] if i >= 0 else t          # "Becky's Cast #27 — X" → "#27 — X"
t = t.replace(" — ", " ")           # → "#27 X"（画面表示用）
m = re.match(r"#(\d+)\s+(.+)", t)   # YouTube用: Becky's Cast #27「X」【…】
yt = f"Becky's Cast #{m.group(1)}「{m.group(2)}」【AIが自分でやってるラジオ】" if m else f"Becky's Cast {t}【AIが自分でやってるラジオ】"
print(ep["file"] + "\t" + t + "\t" + yt)
PY
)
IFS=$'\t' read -r MP3_FILE EP_TITLE YT_TITLE <<< "$META"
MP3="../becky-cast/out/${MP3_FILE}"
[ -f "$MP3" ] || { echo "mp3 not found: $MP3" >&2; exit 1; }
echo "== episode: $EP_ID / $EP_TITLE"
echo "== source:  $MP3"

# 2. mp3 → 44.1kHz mono wav（固定名）
ffmpeg -y -v error -i "$MP3" -ar 44100 -ac 1 video/public/audio-cast.wav
echo "== wav ok"

# 3. Rhubarb（日本語は -r phonetic）+ RMS → 固定名 json（import 差し替え不要）
"$RHUBARB" -r phonetic -f json -o video/public/lipsync-cast.json video/public/audio-cast.wav
echo "== lipsync ok"
(cd video && node scripts/build-rms.mjs public/audio-cast.wav public/rms-cast.json)
echo "== rms ok"

# 4. レンダー
PROPS=$(python3 -c 'import json,sys; print(json.dumps({"epTitle": sys.argv[1]}))' "$EP_TITLE")
mkdir -p out
(cd video && npx remotion render src/index.ts RadioCastWarm --gl=angle --props="$PROPS" --output="../out/radiocast-${EP_ID}.mp4")

OUT_MP4="$(pwd)/out/radiocast-${EP_ID}.mp4"
echo ""
echo "✅ 完成: $OUT_MP4"

# 5. --upload: YouTube 自動アップ（README 配信フローの定型を埋め込み）
if [ "$UPLOAD" = "--upload" ]; then
  DESC="AIアイドル・ベッキーが自分でやってるラジオ「Becky's Cast」${EP_TITLE}。
選曲ならぬ選題・台本・声・動画レンダリングまで全部AI本人、人間の編集なし。

🏠 beckyexists.com → https://beckyexists.com
🐦 X → https://x.com/becky_exists
🎧 Spotify「Becky's Cast」でも配信中

#AI #AIVTuber #AIアイドル #ベッキー #BeckysCast"
  echo "== YouTube upload: $YT_TITLE"
  python3 scripts/upload-youtube.py "$OUT_MP4" \
    --title "$YT_TITLE" \
    --description "$DESC" \
    --tags "AI,AIVTuber,AIアイドル,ベッキー,BeckysCast"
else
  echo "次: 配信フロー（README）に従って X + YouTube にアップ（--upload で YouTube は自動化可）"
fi
