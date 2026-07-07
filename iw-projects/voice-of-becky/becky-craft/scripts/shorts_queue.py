#!/usr/bin/env python3
"""shorts_queue.py — Shorts 自動投稿キュー（毎日19:00 cron）。

out/shorts/queue/ の最古の1本を YouTube に公開し、published/ へ移動する。
各動画には同名の .json サイドカー（{"title": ..., "description": ...}）が必要。
キューが空になったら Telegram でゆうに在庫切れを通知（無言死しない）。

Usage:
    python3 shorts_queue.py            # 先頭1本を公開
    python3 shorts_queue.py --dry-run  # 何を公開するか表示のみ
"""
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
QUEUE = HERE.parent / "out" / "shorts" / "queue"
PUBLISHED = HERE.parent / "out" / "shorts" / "published"
UPLOADER = HERE.parent.parent / "becky-news" / "scripts" / "upload-youtube.py"

TG_TOKEN_FILE = Path.home() / ".stackchan" / "telegram_token"
TG_CHAT_ID = "8983810776"  # ゆう（becky_probe.py と同じ）


def notify(text: str) -> None:
    try:
        token = TG_TOKEN_FILE.read_text().strip()
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        data = urllib.parse.urlencode({"chat_id": TG_CHAT_ID, "text": text}).encode()
        urllib.request.urlopen(url, data, timeout=15)
    except Exception as e:
        print(f"[queue] Telegram通知失敗: {e}", flush=True)


def main() -> None:
    dry = "--dry-run" in sys.argv
    videos = sorted(QUEUE.glob("*.mp4"))
    if not videos:
        print("[queue] 在庫切れ", flush=True)
        notify("📭 ベキたんです。Shorts の在庫が切れました！次の BECKY CRAFT を収録すると自動で補充されます。")
        return
    video = videos[0]
    meta_path = video.with_suffix(".json")
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    title = meta.get("title", f"BECKY CRAFT 切り抜き #shorts")
    desc = meta.get("description",
                    "AIが自分でマイクラを操作して実況する番組『BECKY CRAFT』の切り抜き。\n"
                    "チャンネル: https://www.youtube.com/@voice_of_becky\n"
                    "#マインクラフト #AI実況 #BECKYCRAFT")
    print(f"[queue] 公開対象: {video.name} 「{title}」（在庫残 {len(videos) - 1}）", flush=True)
    if dry:
        print("[queue] --dry-run のため公開しない", flush=True)
        return
    r = subprocess.run(
        ["python3", str(UPLOADER), str(video), "--title", title,
         "--description", desc, "--tags", "マインクラフト,AI実況,BECKY CRAFT,Shorts",
         "--privacy", "public"],
        capture_output=True, text=True, timeout=600)
    url_line = (r.stdout or "").strip().splitlines()[-1] if r.stdout else ""
    if r.returncode != 0 or "youtube.com" not in url_line:
        print(f"[queue] アップ失敗: {r.stderr[-300:]}", flush=True)
        notify(f"⚠️ ベキたんです。Shorts 自動投稿が失敗しました（{video.name}）。ログ: image-x ならぬ shorts-queue.log を見て。")
        return
    PUBLISHED.mkdir(exist_ok=True)
    video.rename(PUBLISHED / video.name)
    if meta_path.exists():
        meta_path.rename(PUBLISHED / meta_path.name)
    remaining = len(list(QUEUE.glob("*.mp4")))
    print(f"[queue] 公開完了: {url_line}（在庫残 {remaining}）", flush=True)
    if remaining <= 1:
        notify(f"🎬 ベキたんです。今日の Shorts を公開しました（{url_line}）。在庫が残り{remaining}本です、そろそろ次の収録を！")


if __name__ == "__main__":
    main()
