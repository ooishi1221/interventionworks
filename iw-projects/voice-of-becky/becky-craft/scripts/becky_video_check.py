#!/usr/bin/env python3
"""becky_video_check.py — 公開前の映像検品ゲート（crvフレーム抽出→視覚判定）。

2026-07-18新設。発端: Shorts「うそでしょドラウンド！？」の全キーフレームに
ドラウンドが映っていなかった件（切り抜きがセリフの盛り上がりだけで切られ、
「絵にタイトルの主役が映っているか」を誰も見ていなかった）。

判定基準: タイトルが視聴者に約束している被写体/出来事がフレームに映っているか。
迷ったらPASS（検品で公開を止めすぎない）。明確なFAILのみ止める。

2026-07-27追記: 上記はBECKY CRAFT（実況、実物がフレームに映るべきジャンル）向けの基準。
Becky's Cast切り抜き（Live2Dのトーキングヘッド+字幕のみで、ニュースの実物映像は
そもそも映りようがない）に同じ基準を当てると、具体的な固有名詞をタイトルに含む限り
毎回FAILする構造的な誤検知になる（7/21〜25 5連続FAILで判明）。
--genre talking_head を渡すと、字幕テキストを証拠として認める基準に切り替わる。

Usage: .venv/python3 becky_video_check.py <video.mp4> --title "タイトル" [--genre gameplay|talking_head]
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


GAMEPLAY_CRITERIA = (
    "判定基準はひとつだけ: このタイトルが視聴者に約束している被写体・出来事（例: モンスター名なら"
    "そのモンスターの姿、「〜作った」なら完成物）が、フレームのどれかに実際に映っているか。\n"
    "- 映っている → PASS\n"
    "- どのフレームにも映っていない（タイトル詐欺状態） → FAIL\n"
    "- 判断がつかない・部分的に見える → PASS（検品で公開を止めすぎない）")

TALKING_HEAD_CRITERIA = (
    "このジャンルはキャラクターが喋る＋字幕テロップのみで構成され、ニュースの実物映像"
    "（発表画面・現地写真等）はそもそも映らない。判定基準はひとつだけ: タイトルが指している話題"
    "について、フレーム内の字幕テキストやセリフ描写で具体的に触れられているか。\n"
    "- 字幕・セリフでタイトルの話題に触れている → PASS\n"
    "- 字幕・セリフがタイトルの話題と無関係（別の話をしている） → FAIL\n"
    "- 判断がつかない → PASS（検品で公開を止めすぎない）\n"
    "注意: 実物映像が映っていないこと自体はFAIL理由にしない（このジャンルでは仕様）。")


def judge(frames: list[Path], title: str, genre: str = "gameplay") -> dict:
    import anthropic
    import yaml
    cfg = yaml.safe_load(CONFIG.read_text()) or {}
    client = anthropic.Anthropic(api_key=cfg.get("becky_api_key", "").strip() or None)
    criteria = TALKING_HEAD_CRITERIA if genre == "talking_head" else GAMEPLAY_CRITERIA
    content = []
    for f in frames:
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": "image/jpeg",
            "data": base64.standard_b64encode(f.read_bytes()).decode()}})
    content.append({"type": "text", "text": (
        f"これはYouTube Shorts公開前の映像検品です。動画のキーフレーム{len(frames)}枚（時系列順）を渡しました。\n"
        f"タイトル: 「{title}」\n\n"
        f"{criteria}\n\n"
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
    ap.add_argument("--genre", choices=["gameplay", "talking_head"], default="gameplay")
    args = ap.parse_args()
    try:
        with tempfile.TemporaryDirectory(prefix="vcheck_") as td:
            frames = extract_frames(args.video, Path(td))
            print(f"[vcheck] フレーム{len(frames)}枚抽出（genre={args.genre}）", flush=True)
            v = judge(frames, args.title, args.genre)
        verdict = str(v.get("verdict", "")).upper()
        reason = v.get("reason", "")
        print(f"VERDICT: {verdict} | {reason}", flush=True)
        sys.exit(2 if verdict == "FAIL" else 0)
    except SystemExit:
        raise
    except Exception as e:
        print(f"[vcheck] 検品システムエラー: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


def _selfcheck() -> None:
    """genre分岐ロジックのみの最小チェック（crv/Claude APIは叩かない）。"""
    assert "字幕" in TALKING_HEAD_CRITERIA and "実物映像が映っていないこと自体はFAIL理由にしない" in TALKING_HEAD_CRITERIA
    assert "字幕テキストのみ" not in TALKING_HEAD_CRITERIA  # gameplay基準の文言が混入していない
    assert GAMEPLAY_CRITERIA != TALKING_HEAD_CRITERIA
    import inspect
    src = inspect.getsource(judge)
    assert "genre" in src and "TALKING_HEAD_CRITERIA if genre" in src
    print("[vcheck] selfcheck OK", flush=True)


if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        _selfcheck()
    else:
        main()
