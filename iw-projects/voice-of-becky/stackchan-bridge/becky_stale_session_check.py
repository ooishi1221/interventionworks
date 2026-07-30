#!/usr/bin/env python3
"""becky_stale_session_check.py — 放置された対話claude CLIセッションを検知しTelegram通知。

2026-07-30 新設: 13日・7日放置のclaude CLIセッション2つがswap圧迫の一因と判明
(メモリ危機調査から)。自動killはしない(進行中の作業を誤って殺すリスクがあるため)、
通知のみで裕司の判断に委ねる。
crontabで呼ぶ: 毎日1回。
"""
import json
import re
import subprocess
import urllib.request
from pathlib import Path

TELEGRAM_ENV = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"
THRESHOLD_HOURS = 72
EXCLUDE_MARKERS = ("--channels",)  # --channels常駐chatモードは意図的な永続プロセスなので対象外


def load_token() -> str | None:
    if not TELEGRAM_ENV.exists():
        return None
    for line in TELEGRAM_ENV.read_text().splitlines():
        if line.startswith("TELEGRAM_BOT_TOKEN="):
            return line.split("=", 1)[1].strip()
    return None


def send_telegram(text: str) -> None:
    token = load_token()
    if not token:
        print("[stale-check] token not found", flush=True)
        return
    data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=data, headers={"Content-Type": "application/json"}, method="POST",
    )
    urllib.request.urlopen(req, timeout=10)


def etime_to_hours(etime: str) -> float:
    """ps etime形式 [[DD-]HH:]MM:SS を時間に変換。"""
    m = re.match(r"(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)", etime.strip())
    if not m:
        return 0.0
    days, hh, mm, _ss = m.groups()
    return int(days or 0) * 24 + int(hh or 0) + int(mm) / 60


def find_stale_sessions() -> list[str]:
    out = subprocess.run(
        ["ps", "-eo", "pid,etime,tty,command"], capture_output=True, text=True,
    ).stdout
    stale = []
    for line in out.splitlines()[1:]:
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        pid, etime, tty, cmd = parts
        if not re.search(r"\bclaude\b", cmd, re.IGNORECASE):
            continue
        if tty == "??":  # 対話セッションではない(GUI/バックグラウンド起動)
            continue
        if any(marker in cmd for marker in EXCLUDE_MARKERS):
            continue
        if etime_to_hours(etime) >= THRESHOLD_HOURS:
            stale.append(f"PID {pid} ({etime}経過, {tty})")
    return stale


def main() -> None:
    stale = find_stale_sessions()
    if stale:
        text = (
            f"🔔 {THRESHOLD_HOURS}h以上放置の対話claudeセッション検知:\n"
            + "\n".join(stale)
            + "\n\nメモリ圧迫の一因かも。使ってなければ切っていい？"
        )
        send_telegram(text)


if __name__ == "__main__":
    assert abs(etime_to_hours("13-15:46:10") - (13 * 24 + 15 + 46 / 60)) < 0.01
    assert abs(etime_to_hours("07-21:07:39") - (7 * 24 + 21 + 7 / 60)) < 0.01
    assert abs(etime_to_hours("05:23") - (5 / 60)) < 0.01  # "05:23" は mm:ss (5分23秒)
    main()
