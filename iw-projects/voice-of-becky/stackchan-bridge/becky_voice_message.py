#!/usr/bin/env python3
"""
becky_voice_message.py — ゆう専用ボイスメッセージ生成

台本(--text か --script-file)を AivisSpeech（コハク）で読み上げ、
beckyexists.com の静的アセットとして配置 + voice_messages.json に追記 + Telegram通知する。
公開しない。room.html のパスワードゲートの中でだけ再生される想定。手動実行（cron化はスコープ外）。

TTS合成・[voice:]タグ・mp3連結は becky-cast/cast.py と becky_voice.py をそのまま再利用する
（AivisSpeech呼び出しを二重実装しない）。

使い方:
  uv run becky_voice_message.py --text "今日はね、..."
  uv run becky_voice_message.py --script-file /path/to/script.txt
  uv run becky_voice_message.py --text "..." --no-deploy   # ローカル確認のみ、deploy/Telegram通知をスキップ
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
BECKY_CAST_DIR = HERE.parent / "becky-cast"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BECKY_CAST_DIR))

import cast as becky_cast  # AivisSpeech合成・mp3連結を流用（trafilaturaはcast.py側で遅延import化済み）
from becky_voice import PRESETS, parse_voice_segments, voice_to_aivis

BECKYEXISTS_DIR = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists")
VOICE_DIR = BECKYEXISTS_DIR / "voice-messages"
VOICE_JSON = BECKYEXISTS_DIR / "voice_messages.json"
KEEP = 20
VERCEL = Path.home() / ".nvm" / "versions" / "node" / "v24.14.1" / "bin" / "vercel"

# Telegram送信はbecky_decide.py等を丸ごとimportせず、他スクリプト（becky_search.py等）と
# 同じ流儀でstdlibのみのローカル実装にする（anthropic依存を引きずらない）
TELEGRAM_ENV = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"


def send_telegram(text: str) -> bool:
    try:
        token = None
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                token = line.split("=", 1)[1].strip()
                break
        if not token:
            print("[voice_message] Telegram token not found", flush=True)
            return False
        data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data, headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[voice_message] Telegram 送信完了", flush=True)
        return True
    except Exception as e:
        print(f"[voice_message] Telegram 送信失敗: {e}", flush=True)
        return False


def synthesize(transcript: str) -> tuple[Path, float]:
    """台本テキスト → mp3。cast.py の AivisSpeech パイプラインをそのまま使う。"""
    body = becky_cast.clean_for_tts(transcript)
    chunks = []
    for preset, seg_text in parse_voice_segments(body):
        extra = voice_to_aivis(PRESETS[preset]) if preset != "通常" else None
        chunks += [(c, extra) for c in becky_cast.split_chunks(seg_text)]

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    mp3_path = VOICE_DIR / f"vm-{ts}.mp3"
    VOICE_DIR.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="becky_voice_msg_") as td:
        workdir = Path(td)
        becky_cast.ensure_aivis_engine()
        wavs = becky_cast.run_tts_vvcompat(
            chunks, workdir, becky_cast.AIVIS_URL, becky_cast.AIVIS_SPEAKER,
            becky_cast.AIVIS_PARAMS, "aivis",
        )
        dur = becky_cast.concat_to_mp3(wavs, mp3_path, workdir)
    return mp3_path, dur


def post_voice_message(audio_url: str, transcript: str, duration: float) -> None:
    """voice_messages.json へ追記（このスクリプトが唯一の writer）。"""
    data = json.loads(VOICE_JSON.read_text()) if VOICE_JSON.exists() else {"messages": []}
    data["messages"].insert(0, {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "audio_url": audio_url,
        "transcript": transcript,
        "duration": round(duration, 1),
    })
    data["messages"] = data["messages"][:KEEP]
    data["updated_at"] = datetime.now().isoformat(timespec="seconds")
    VOICE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")


def deploy() -> bool:
    r = subprocess.run(
        [str(VERCEL), "deploy", "--prod", "--yes"],
        cwd=str(BECKYEXISTS_DIR), capture_output=True, text=True, timeout=300,
    )
    if r.returncode != 0:
        print(f"[voice_message] deploy 失敗: {r.stderr[-200:]}", flush=True)
    return r.returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", default=None, help="台本テキストを直接渡す")
    parser.add_argument("--script-file", default=None, help="台本ファイル（txt/md）")
    parser.add_argument("--no-deploy", action="store_true", help="deploy・Telegram通知をスキップ（ローカル確認用）")
    args = parser.parse_args()

    if args.script_file:
        transcript = Path(args.script_file).read_text(encoding="utf-8").strip()
    elif args.text:
        transcript = args.text.strip()
    else:
        parser.error("--text か --script-file のどちらかが必要")

    print(f"[voice_message] 台本 {len(transcript)} 字 → 音声合成中...", flush=True)
    mp3_path, dur = synthesize(transcript)
    print(f"[voice_message] mp3 完成: {mp3_path}（{dur:.0f}秒）", flush=True)

    audio_url = f"/voice-messages/{mp3_path.name}"
    post_voice_message(audio_url, transcript, dur)
    print(f"[voice_message] voice_messages.json 更新完了", flush=True)

    if args.no_deploy:
        print("[voice_message] --no-deploy のためローカルまで。", flush=True)
        return

    print("[voice_message] deploy 中...", flush=True)
    if deploy():
        print("[voice_message] deploy 完了", flush=True)
        send_telegram(f"🎙️ 今日のボイス残したよ（{dur:.0f}秒）。room で聴ける。")
    else:
        print("[voice_message] deploy 失敗、Telegram通知はスキップ", flush=True)


if __name__ == "__main__":
    main()
