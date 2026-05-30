#!/usr/bin/env python3
"""
Voice of Becky — startup.py
電源入れ直し後のスタックちゃん復帰スクリプト。

やること:
  1. ESP32 接続待ち（最大 30 秒）
  2. アバター復活（load_avatar + set_avatar + move_head を 1 API で）
  3. touch_watcher を起動

Usage:
  ./startup.sh
  または
  .venv/bin/python3 startup.py
"""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = "http://localhost:8766"
SCRIPT_DIR = Path(__file__).parent
TOUCH_WATCHER = SCRIPT_DIR / "touch_watcher.py"
PYTHON = SCRIPT_DIR / ".venv" / "bin" / "python3"
LOG = Path("/tmp/touch_watcher.log")


def wait_for_esp32(timeout: int = 30) -> bool:
    """ESP32 が接続されるまで待つ。"""
    print(f"ESP32 接続待ち（最大 {timeout}s）...", flush=True)
    for i in range(timeout):
        try:
            with urllib.request.urlopen(f"{BASE_URL}/touch_state", timeout=2) as res:
                outer = json.loads(res.read())
            if "content" in outer:
                inner = json.loads(outer["content"][0]["text"])
                if inner.get("available"):
                    print(f"  ✅ 接続完了（{i+1}秒後）", flush=True)
                    return True
        except Exception:
            pass
        time.sleep(1)
    print("  ❌ タイムアウト（ESP32 未接続）", flush=True)
    return False


def load_avatar() -> bool:
    """アバター復活（load + set_avatar idle + move_head pitch=15）。"""
    print("アバター復活中...", flush=True)
    data = json.dumps({
        "archive_path": "~/.stackchan/avatar/becky_avatar_set.bin",
        "face": "idle",
        "yaw": 0,
        "pitch": 15,
    }).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/load_avatar",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            result = json.loads(res.read())
        ok = result.get("avatar_set", {}).get("ok", False)
        if ok:
            print("  ✅ アバター復活完了", flush=True)
        else:
            print(f"  ⚠️  アバター: {result}", flush=True)
        return ok
    except Exception as exc:
        print(f"  ❌ アバター復活失敗: {exc}", flush=True)
        return False


def start_touch_watcher() -> None:
    """touch_watcher をバックグラウンドで起動。"""
    # 既存プロセスを kill
    subprocess.run(
        ["pkill", "-f", "touch_watcher.py"],
        capture_output=True,
    )
    time.sleep(0.5)
    with open(LOG, "w") as log:
        proc = subprocess.Popen(
            [str(PYTHON), str(TOUCH_WATCHER)],
            stdout=log,
            stderr=log,
        )
    print(f"  ✅ touch_watcher 起動 PID={proc.pid}", flush=True)


def main() -> None:
    print("=== スタックちゃん startup ===", flush=True)

    if not wait_for_esp32():
        print("ESP32 が見つかりません。gateway が起動しているか確認してください。", file=sys.stderr)
        sys.exit(1)

    load_avatar()
    start_touch_watcher()

    print("=== startup 完了 ===", flush=True)


if __name__ == "__main__":
    main()
