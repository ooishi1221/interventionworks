#!/usr/bin/env python3
"""record-episode.py — BECKY CRAFT テスト実況動画を1コマンドで生成。

viewer(:3007) を Playwright で録画しながら becky_brain.run_episode を回し、
各ターンの speech を AivisSpeech(コハク) で wav 化 → 経過秒を記録 →
ffmpeg で adelay+amix 合成して mp4 に焼く。

使い方: python3 record-episode.py [--max-calls 30] [--out becky-craft-test-001.mp4]
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
CRAFT = HERE.parent
sys.path.insert(0, str(CRAFT / "brain"))
from becky_brain import run_episode  # noqa: E402

VIEWER_URL = "http://localhost:3007"
AIVIS_URL = "http://localhost:10101"
AIVIS_SPEAKER = 1878365376  # コハク / ノーマル（becky-cast/cast.py と同じ）
AIVIS_PARAMS = {"speedScale": 1.0, "prePhonemeLength": 0.18, "postPhonemeLength": 0.18}

GOAL = ("地下にいるようなら地上に出て、周辺を探索して見つけたものに反応して。"
        "掘りすぎ禁止、移動と観察多め")


def tts(text: str, out_path: Path):
    q = urllib.parse.urlencode({"text": text, "speaker": AIVIS_SPEAKER})
    req = urllib.request.Request(f"{AIVIS_URL}/audio_query?{q}", method="POST")
    with urllib.request.urlopen(req, timeout=30) as res:
        query = json.loads(res.read())
    query.update(AIVIS_PARAMS)
    q2 = urllib.parse.urlencode({"speaker": AIVIS_SPEAKER})
    req2 = urllib.request.Request(
        f"{AIVIS_URL}/synthesis?{q2}",
        data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req2, timeout=120) as res:
        out_path.write_bytes(res.read())


def wav_duration(p: Path) -> float:
    with wave.open(str(p), "rb") as w:
        return w.getnframes() / w.getframerate()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, default=30)
    ap.add_argument("--out", default="becky-craft-test-001.mp4")
    args = ap.parse_args()

    out_dir = CRAFT / "out"
    wav_dir = out_dir / "wav"
    video_dir = out_dir / "video"
    for d in (wav_dir, video_dir):
        d.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import sync_playwright

    events = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=str(video_dir),
            record_video_size={"width": 1280, "height": 720},
        )
        page = ctx.new_page()
        t0 = time.monotonic()  # 録画は page 生成と同時に始まる
        page.goto(VIEWER_URL)
        page.wait_for_timeout(10_000)  # WebGL 描画待ち（headless は初回真っ白対策）

        # HUD 注入 + 初期状態（goal と現在の observe を先に描く）
        page.add_script_tag(path=str(HERE / "hud.js"))

        def hud(d):
            try:
                page.evaluate("d => window.beckyHud && window.beckyHud.update(d)", d)
            except Exception as e:
                print(f"[hud] update 失敗: {e}", flush=True)

        def hud_obs(obs):
            hud({"health": obs.get("health"), "food": obs.get("food"),
                 "inventory": obs.get("inventory", []),
                 "pos": obs.get("position"), "time": obs.get("time")})

        hud({"goal": GOAL})
        try:
            with urllib.request.urlopen("http://localhost:3008/observe", timeout=10) as r:
                hud_obs(json.loads(r.read()))
        except Exception as e:
            print(f"[hud] 初期 observe 失敗: {e}", flush=True)

        def on_thinking(flag):
            hud({"thinking": flag})

        def on_turn(turn, decision, obs):
            hud_obs(obs)
            speech = (decision.get("speech") or "").strip()
            if not speech:
                return 10.0
            wav = wav_dir / f"turn_{turn:03d}.wav"
            try:
                tts(speech, wav)
                dur = wav_duration(wav)
            except Exception as e:
                print(f"[tts] turn {turn} 失敗、スキップ: {e}", flush=True)
                return 10.0
            # t は字幕表示と同時刻に取る（合成音声の adelay と字幕が揃う）
            t = time.monotonic() - t0
            hud({"speech": speech, "inner": (decision.get("inner") or "").strip(),
                 "speechDur": dur})
            events.append({"t": round(t, 3), "wav_path": str(wav),
                           "speech": speech, "dur": round(dur, 3)})
            return max(dur + 2.0, 10.0)  # セリフ被り防止

        run_episode(max_calls=args.max_calls, goal=GOAL, on_turn=on_turn,
                    on_thinking=on_thinking)

        # 最後のセリフが映像内で言い終わるまで録画を延長
        if events:
            tail = events[-1]["t"] + events[-1]["dur"] + 2.0 - (time.monotonic() - t0)
            if tail > 0:
                page.wait_for_timeout(int(tail * 1000))

        video = page.video
        page.close()
        webm = Path(video.path())
        ctx.close()
        browser.close()

    audio_json = out_dir / "episode_audio.json"
    audio_json.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[rec] 録画完了 webm={webm} events={len(events)} → {audio_json}", flush=True)

    # 合成: webm→mp4 + 各 wav を adelay して amix(normalize=0)
    mp4 = out_dir / args.out
    cmd = ["ffmpeg", "-y", "-i", str(webm)]
    for e in events:
        cmd += ["-i", e["wav_path"]]
    if events:
        parts = []
        for i, e in enumerate(events, start=1):
            ms = int(e["t"] * 1000)
            parts.append(f"[{i}:a]adelay={ms}:all=1,volume=1.5[a{i}]")
        mix_in = "".join(f"[a{i}]" for i in range(1, len(events) + 1))
        # ponytail: amix normalize=0 で減衰回避 + alimiter でクリップ保険（前回の音量課題対応）
        parts.append(f"{mix_in}amix=inputs={len(events)}:normalize=0,alimiter=limit=0.9[aout]")
        cmd += ["-filter_complex", ";".join(parts), "-map", "0:v", "-map", "[aout]"]
    else:
        cmd += ["-map", "0:v"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(mp4)]
    subprocess.run(cmd, check=True, capture_output=True)

    # 検証: duration / ストリーム / 途中フレーム1枚
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(mp4)],
        check=True, capture_output=True).stdout)
    dur = float(probe["format"]["duration"])
    codecs = {s["codec_type"]: s["codec_name"] for s in probe["streams"]}
    assert "video" in codecs and "audio" in codecs, f"stream 欠落: {codecs}"
    frame = out_dir / "check_frame.png"
    subprocess.run(["ffmpeg", "-y", "-ss", str(dur / 2), "-i", str(mp4),
                    "-frames:v", "1", str(frame)], check=True, capture_output=True)
    print(f"[done] {mp4} ({dur:.1f}s, {codecs}) frame={frame}", flush=True)


if __name__ == "__main__":
    main()
