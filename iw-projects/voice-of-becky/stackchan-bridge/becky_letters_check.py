#!/usr/bin/env python3
"""ご意見ボックスの新着お便りをTelegramに通知する30分毎cron。

VPSの ~/.becky/letters.jsonl を取得し、ローカル控え(~/.stackchan/letters.jsonl)との
差分をゆうのTelegramへ通知してから控えを更新する。初回実行は控えを作るだけ(通知なし)。
Cast側の消費は morning_cast.py が別途 radio_letters_used.json で管理しており、ここは触らない。
"""
import json
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

VPS = ["ssh", "-i", str(Path.home() / ".ssh" / "iw-local-key.key"),
       "-o", "ConnectTimeout=15", "ubuntu@133.18.123.60",
       "cat ~/.becky/letters.jsonl 2>/dev/null || true"]
LOCAL = Path.home() / ".stackchan" / "letters.jsonl"
ENV = Path.home() / ".claude" / "channels" / "telegram" / ".env"
CHAT_ID = "8983810776"


def token() -> str:
    for line in ENV.read_text().splitlines():
        if "TOKEN" in line and "=" in line:
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("telegram token not found")


def notify(letter: dict) -> None:
    name = letter.get("name") or "(匿名)"
    text = f"📮 新しいお便りが届いたよ\n\nFrom: {name}\n\n{letter.get('message', '')}\n\n(未読のまま置いておけば、次の朝のCastが自動で読むよ)"
    data = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text}).encode()
    urllib.request.urlopen(
        f"https://api.telegram.org/bot{token()}/sendMessage", data=data, timeout=15
    ).read()


def main() -> None:
    remote = subprocess.run(VPS, capture_output=True, text=True, timeout=60).stdout
    if not remote.strip():
        print("[letters] リモート空 or 取得失敗、何もしない", flush=True)
        return
    seen = set()
    if LOCAL.exists():
        for line in LOCAL.read_text().splitlines():
            try:
                seen.add(json.loads(line)["ts"])
            except Exception:
                pass
        first_run = False
    else:
        first_run = True
    new = []
    for line in remote.splitlines():
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get("ts") not in seen:
            new.append(d)
    if first_run:
        print(f"[letters] 初回: 控え作成のみ({len(new)}通、通知なし)", flush=True)
    else:
        for d in new:
            try:
                notify(d)
                print(f"[letters] 通知: {d.get('name')} {d.get('ts')}", flush=True)
            except Exception as e:
                print(f"[letters] 通知失敗({e})、控え更新は継続", flush=True)
    LOCAL.write_text(remote)


if __name__ == "__main__":
    main()
