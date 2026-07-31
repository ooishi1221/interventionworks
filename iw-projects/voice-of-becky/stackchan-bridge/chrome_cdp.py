#!/usr/bin/env python3
"""chrome_cdp.py — 専用Chrome(CDP:9223)のオンデマンド起動/終了ヘルパー。

2026-07-30: becky-watchdog.sh の5分毎「落ちてたら起動」常時監視をやめた
(実際の利用はbecky_search.py/becky_fan_collector.pyの1日数回のcronだけで、
24時間分のメモリ(~1GB)が無駄だったため)。使う側が起動→使用→終了を
自己完結させる。
"""
import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

CDP_PORT = 9223
CHROME_PROFILE_DIR = Path.home() / ".stackchan" / "gemini-chrome-profile"
CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
STARTUP_TIMEOUT_SEC = 15
SHUTDOWN_TIMEOUT_SEC = 8


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


def _main_pids() -> list[int]:
    """このプロファイルのChromeメインプロセス(--type= を持たない親)のPID。
    レンダラ/GPU等の子プロセスにも同じ --user-data-dir が渡るので除外する。"""
    pids = []
    try:
        out = subprocess.run(["pgrep", "-fl", str(CHROME_PROFILE_DIR)],
                             capture_output=True, text=True, timeout=10).stdout
        for line in out.splitlines():
            pid, _, cmd = line.partition(" ")
            if pid.isdigit() and "--type=" not in cmd:
                pids.append(int(pid))
    except Exception:
        pass
    return pids


def stop() -> None:
    """使用後にこのChromeを終了する。

    2026-07-31: pkill(親子まとめて一斉SIGTERM)をやめ、メインプロセスにだけ送って
    Chrome自身にシャットダウン処理をさせる。レンダラごと同時に殺すと正常終了しきれず、
    Cookieなどのプロファイルがディスクへ書き戻されないまま落ちる。オンデマンド化した
    7/30の翌朝、note/x_analytics/x_dev/claude_apiが軒並みログイン切れになって発覚した
    (常時起動時代はそもそも終了しないので露見しなかった)。
    """
    pids = _main_pids()
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    for _ in range(SHUTDOWN_TIMEOUT_SEC * 2):  # 書き戻しの猶予を与えて待つ
        time.sleep(0.5)
        if not _is_alive():
            return
    # 正常終了しきらなかった時だけ最終手段。ここに来た回はログインが飛びうる
    print("[chrome_cdp] 正常終了せず、pkillで強制終了する", flush=True)
    subprocess.run(["pkill", "-f", str(CHROME_PROFILE_DIR)], check=False)
