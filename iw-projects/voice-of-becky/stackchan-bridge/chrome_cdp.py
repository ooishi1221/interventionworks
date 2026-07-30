#!/usr/bin/env python3
"""chrome_cdp.py — 専用Chrome(CDP:9223)のオンデマンド起動/終了ヘルパー。

2026-07-30: becky-watchdog.sh の5分毎「落ちてたら起動」常時監視をやめた
(実際の利用はbecky_search.py/becky_fan_collector.pyの1日数回のcronだけで、
24時間分のメモリ(~1GB)が無駄だったため)。使う側が起動→使用→終了を
自己完結させる。
"""
import subprocess
import time
import urllib.request
from pathlib import Path

CDP_PORT = 9223
CHROME_PROFILE_DIR = Path.home() / ".stackchan" / "gemini-chrome-profile"
CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
STARTUP_TIMEOUT_SEC = 15


def _is_alive() -> bool:
    try:
        urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json/version", timeout=2)
        return True
    except Exception:
        return False


def ensure_running() -> tuple[bool, bool]:
    """CDP:9223が生きてなければ起動し、応答するまで待つ。
    戻り値: (使える状態か, この呼び出しで新規起動したか)

    platform_scraper.py(07:30)がこのChromeを別ロジックで起動する場合があり、
    5分後のbecky_fan_collector.py(07:35)と時間が近い。他プロセスが起動した
    Chromeを誤って止めないよう、「自分が起動した時だけ後で止めてよい」を返す。
    """
    if _is_alive():
        return True, False
    subprocess.Popen(
        [
            CHROME_BIN,
            f"--user-data-dir={CHROME_PROFILE_DIR}",
            f"--remote-debugging-port={CDP_PORT}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-session-crashed-bubble",
            "https://x.com",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    for _ in range(STARTUP_TIMEOUT_SEC):
        time.sleep(1)
        if _is_alive():
            return True, True
    return False, False


def stop() -> None:
    """使用後にこのChromeプロセス群を終了する。"""
    subprocess.run(["pkill", "-f", "gemini-chrome-profile"], check=False)
