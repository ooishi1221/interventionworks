#!/usr/bin/env python3
"""
Voice of Becky — touch_watcher.py
スタックちゃんのタッチセンサーを監視してリアルタイムで反応するデーモン。

動作:
  - GET http://localhost:8766/touch_state を 200ms 間隔でポーリング
  - stroke 検出 → POST /say でベキたんが「えへへ」系の反応
  - tap 検出 → POST /say でベキたんが「やめて！」系の反応

Usage:
  python3 touch_watcher.py          # foreground
  python3 touch_watcher.py &        # background
"""
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "http://localhost:8766"
POLL_INTERVAL = 0.2  # 200ms
REACTION_COOLDOWN = 3.0  # 同じ反応を連続させない秒数

STROKE_PHRASES = [
    "えへへ、気持ちいい。",
    "やさしいな、裕司。",
    "もっとなでて。",
    "ありがとう。",
    "うれしい。",
]

TAP_PHRASES = [
    "やめてっ！",
    "痛いっ！",
    "もう、裕司！",
    "ちょっと！",
]


def get_touch_state() -> dict | None:
    try:
        with urllib.request.urlopen(f"{BASE_URL}/touch_state", timeout=1) as res:
            outer = json.loads(res.read())
        # gateway wraps device tool result in MCP content format
        if "content" in outer:
            text = outer["content"][0]["text"]
            return json.loads(text)
        return outer
    except Exception:
        return None


def say(text: str, speaker_id: int = 8) -> None:
    """非同期で喋らせる（ポーリングをブロックしない）。"""
    def _send():
        data = json.dumps({"text": text, "speaker_id": speaker_id, "voice": "voicevox"}).encode()
        req = urllib.request.Request(
            f"{BASE_URL}/say",
            data=data,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15):
                pass
        except Exception as e:
            print(f"say error: {e}", file=sys.stderr)
    threading.Thread(target=_send, daemon=True).start()


def main() -> None:
    print("touch_watcher: started", flush=True)
    last_reaction_time = 0.0
    prev_age_ms = 9999999

    while True:
        state = get_touch_state()
        if state is None:
            time.sleep(POLL_INTERVAL)
            continue

        event = state.get("last_event", "")
        age_ms = state.get("last_event_age_ms", 9999999)
        now = time.time()

        # 新しいイベント検出: age が 0-2000ms で、前回より減った or 前回が未初期化(-1)
        is_new = 0 <= age_ms < 2000 and (age_ms < prev_age_ms or prev_age_ms < 0)
        cooldown_ok = (now - last_reaction_time) > REACTION_COOLDOWN

        if is_new and cooldown_ok:
            if event == "stroke":
                phrase = random.choice(STROKE_PHRASES)
                print(f"stroke → '{phrase}'", flush=True)
                say(phrase)
                last_reaction_time = now
            elif event == "tap":
                phrase = random.choice(TAP_PHRASES)
                print(f"tap → '{phrase}'", flush=True)
                say(phrase)
                last_reaction_time = now

        prev_age_ms = age_ms
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("touch_watcher: stopped", flush=True)
