#!/usr/bin/env python3
"""becky_video_check.py — 公開前の映像検品ゲート（crvフレーム抽出→視覚判定）。

2026-07-18新設。発端: Shorts「うそでしょドラウンド！？」の全キーフレームに
ドラウンドが映っていなかった件（切り抜きがセリフの盛り上がりだけで切られ、
「絵にタイトルの主役が映っているか」を誰も見ていなかった）。

判定基準: タイトルが視聴者に約束している被写体/出来事がフレームに映っているか。
迷ったらPASS（検品で公開を止めすぎない）。明確なFAILのみ止める。

Usage: .venv/python3 becky_video_check.py <video.mp4> --title "タイトル"
Exit:  0=PASS / 2=FAIL / 1=検品システム自体のエラー（呼び出し側はfail-openで公開続行）
"""
import argparse
import base64
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

CRV = Path("/Volumes/SSD2TB/crv-venv/bin/crv")
CONFIG = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge/config.yaml")
MAX_FRAMES = 12


def extract_frames(video: Path, outdir: Path) -> list[Path]:
    r = subprocess.run(
        [str(CRV), str(video), "-o", str(outdir), "--overwrite", "--max-frames", str(MAX_FRAMES)],
        capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise RuntimeError(f"crv失敗: {r.stderr[-300:]}")
    frames = sorted((outdir / "frames").glob("*.jpg"))
    if not frames:
        raise RuntimeError("crvがフレームを出力しなかった")
    return frames[:MAX_FRAMES]


def judge(frames: list[Path], title: str) -> dict:
    import anthropic
    import yaml
    cfg = yaml.safe_load(CONFIG.read_text()) or {}
    client = anthropic.Anthropic(api_key=cfg.get("becky_api_key", "").strip() or None)
    content = []
    for f in frames:
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": "image/jpeg",
            "data": base64.standard_b64encode(f.read_bytes()).decode()}})
    content.append({"type": "text", "text": (
        f"これはYouTube Shorts公開前の映像検品です。動画のキーフレーム{len(frames)}枚（時系列順）を渡しました。\n"
        f"タイトル: 「{title}」\n\n"
        "判定基準はひとつだけ: このタイトルが視聴者に約束している被写体・出来事（例: モンスター名なら"
        "そのモンスターの姿、「〜作った」なら完成物）が、フレームのどれかに実際に映っているか。\n"
        "- 映っている → PASS\n"
        "- どのフレームにも映っていない（タイトル詐欺状態） → FAIL\n"
        "- 判断がつかない・部分的に見える → PASS（検品で公開を止めすぎない）\n\n"
        'JSONのみで回答: {"verdict": "PASS"または"FAIL", "reason": "日本語1文"}')})
    msg = client.messages.create(
        model="claude-sonnet-5", max_tokens=200,
        messages=[{"role": "user", "content": content}])
    text = msg.content[0].text
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if not m:
        raise RuntimeError(f"判定JSONが取れない: {text[:120]}")
    return json.loads(m.group(0))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("--title", required=True)
    args = ap.parse_args()
    try:
        with tempfile.TemporaryDirectory(prefix="vcheck_") as td:
            frames = extract_frames(args.video, Path(td))
            print(f"[vcheck] フレーム{len(frames)}枚抽出", flush=True)
            v = judge(frames, args.title)
        verdict = str(v.get("verdict", "")).upper()
        reason = v.get("reason", "")
        print(f"VERDICT: {verdict} | {reason}", flush=True)
        sys.exit(2 if verdict == "FAIL" else 0)
    except SystemExit:
        raise
    except Exception as e:
        print(f"[vcheck] 検品システムエラー: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
