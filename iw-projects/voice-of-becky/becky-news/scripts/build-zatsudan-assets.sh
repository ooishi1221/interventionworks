#!/bin/bash
# 雑談エピソードの素材組み立て: block wav 連結(間0.5s) → 境界JSON → Rhubarb → RMS → 画像/SE を public へ。
# 使い方: ./scripts/build-zatsudan-assets.sh zatsudan-000
set -euo pipefail
cd "$(dirname "$0")/.."   # becky-news/

EP="${1:?usage: $0 <episode-dir>  (例: zatsudan-000)}"
EP_DIR="episodes/${EP}"
NAME="${EP//-/}"          # zatsudan-000 → zatsudan000（public のファイル名）
RHUBARB="./spike/Rhubarb-Lip-Sync-1.14.0-macOS/rhubarb"
GAP=0.5

# 1. 連結（間 GAP 秒）+ 境界 JSON（実 wav 尺を ffprobe で測る = 正本）
python3 - "$EP_DIR" "$NAME" "$GAP" <<'PY'
import json, subprocess, sys, glob, os
ep_dir, name, gap = sys.argv[1], sys.argv[2], float(sys.argv[3])
blocks = sorted(glob.glob(f"{ep_dir}/block_*.wav"))
assert blocks, "no block wavs"
dur = lambda f: float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]))
bounds, t = {}, 0.0
inputs, filters = [], []
for i, b in enumerate(blocks):
    d = dur(b)
    key = os.path.basename(b)[6]        # block_A.wav → A
    bounds[key] = [round(t,3), round(t+d,3)]
    inputs += ["-i", b]
    pad = gap if i < len(blocks)-1 else 0
    filters.append(f"[{i}]apad=pad_dur={pad}[a{i}]")
    t += d + pad
fc = ";".join(filters) + ";" + "".join(f"[a{i}]" for i in range(len(blocks))) + f"concat=n={len(blocks)}:v=0:a=1[out]"
out_wav = f"video/public/audio-{name}.wav"
subprocess.check_call(["ffmpeg","-y","-v","error"]+inputs+["-filter_complex",fc,"-map","[out]","-ar","44100","-ac","1",out_wav])
total = dur(out_wav)
json.dump({"blocks": bounds, "total": round(total,3)}, open(f"video/public/boundaries-{name}.json","w"), indent=1)
print("== concat ok:", out_wav, "total", round(total,3), bounds)
PY

# 2. Rhubarb（日本語は -r phonetic）+ RMS
"$RHUBARB" -r phonetic -f json -o "video/public/lipsync-${NAME}.json" "video/public/audio-${NAME}.wav"
echo "== lipsync ok"
(cd video && node scripts/build-rms.mjs "public/audio-${NAME}.wav" "public/rms-${NAME}.json")
echo "== rms ok"

# 3. SE / 画像 / 部屋背景 を public へ
for f in "$EP_DIR"/se_*.wav "$EP_DIR"/img*.png; do cp "$f" video/public/; done
cp ../stream-frame/room-bg.png video/public/
echo "== assets copied"
