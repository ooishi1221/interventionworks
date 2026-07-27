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
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
QUEUE = HERE.parent / "out" / "shorts" / "queue"
PUBLISHED = HERE.parent / "out" / "shorts" / "published"
UPLOADER = HERE.parent.parent / "becky-news" / "scripts" / "upload-youtube.py"
X_TWEET_CLI = HERE.parent.parent / "x-tweet" / "scripts" / "post-tweet-cli.mjs"  # becky_diary_x.py と同じ投稿経路

TG_ENV = Path.home() / ".claude" / "channels" / "telegram" / ".env"  # becky_probe.py と同じ正本
TG_CHAT_ID = "8983810776"  # ゆう（becky_probe.py と同じ）


def _load_token() -> str:
    for line in TG_ENV.read_text().splitlines():
        if line.startswith("TELEGRAM_BOT_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("TELEGRAM_BOT_TOKEN not found in " + str(TG_ENV))


def notify(text: str) -> None:
    try:
        token = _load_token()
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        data = urllib.parse.urlencode({"chat_id": TG_CHAT_ID, "text": text}).encode()
        urllib.request.urlopen(url, data, timeout=15)
    except Exception as e:
        print(f"[queue] Telegram通知失敗: {e}", flush=True)


def _shorts_url(watch_url: str) -> str:
    """watch?v= 形式を shorts/ 形式に変換（Xでプレビュー展開させるため）。取れなければ元URLのまま。"""
    m = re.search(r"[?&]v=([\w-]+)", watch_url)
    return f"https://www.youtube.com/shorts/{m.group(1)}" if m else watch_url


def post_to_x(url_line: str) -> None:
    """Shorts公開URLをXへ告知（fail-open: 失敗してもYouTube公開自体は成功扱いのまま）。"""
    text = f"新しいShorts公開しました\n{_shorts_url(url_line)}"
    try:
        r = subprocess.run(
            ["node", str(X_TWEET_CLI), text, "--format", "monologue"],
            capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            print(f"[queue] X投稿完了: {r.stdout.strip()}", flush=True)
        else:
            print(f"[queue] X投稿失敗(fail-open): {r.stderr.strip()[:200]}", flush=True)
    except Exception as e:
        print(f"[queue] X投稿例外(fail-open): {e}", flush=True)


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
    genre = meta.get("genre", "gameplay")  # ponytail: 未指定は従来通りgameplay基準（後方互換）
    desc = meta.get("description",
                    "AIが自分でマイクラを操作して実況する番組『BECKY CRAFT』の切り抜き。\n"
                    "チャンネル: https://www.youtube.com/@voice_of_becky\n"
                    "#マインクラフト #AI実況 #BECKYCRAFT")
    print(f"[queue] 公開対象: {video.name} 「{title}」（在庫残 {len(videos) - 1}）", flush=True)
    if dry:
        print("[queue] --dry-run のため公開しない", flush=True)
        return

    # 公開前の映像検品（2026-07-18新設。タイトルの主役が絵に映っているか——森林浴ドラウンド事件の再発防止）
    # fail-open設計: 検品システム自体の故障(exit 1/例外/timeout)では公開を止めない。明確なFAIL(exit 2)のみ見送り
    checker = HERE / "becky_video_check.py"
    venv_py = HERE.parent.parent / "stackchan-bridge" / ".venv" / "bin" / "python3"
    try:
        chk = subprocess.run([str(venv_py), str(checker), str(video), "--title", title,
                              "--genre", genre],
                             capture_output=True, text=True, timeout=900)
        verdict_line = next((l for l in (chk.stdout or "").splitlines() if l.startswith("VERDICT:")), "")
        print(f"[queue] 映像検品: {verdict_line or f'エラー(exit {chk.returncode})'}", flush=True)
        if chk.returncode == 2:
            rejected = HERE.parent / "out" / "shorts" / "rejected"
            rejected.mkdir(parents=True, exist_ok=True)
            video.rename(rejected / video.name)
            if meta_path.exists():
                meta_path.rename(rejected / meta_path.name)
            notify(f"🎬 ベキたんです。Shorts「{title}」は映像検品で見送りました（{verdict_line}）。"
                   f"rejected/へ移動、今日の公開はなし。切り直しは次の収録で。")
            return
        elif chk.returncode != 0:
            print(f"[queue] 検品システムエラー、fail-openで公開続行: {(chk.stderr or '')[-200:]}", flush=True)
    except Exception as e:
        print(f"[queue] 検品スキップ(fail-open): {e}", flush=True)

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
    post_to_x(url_line)
    remaining = len(list(QUEUE.glob("*.mp4")))
    print(f"[queue] 公開完了: {url_line}（在庫残 {remaining}）", flush=True)
    if remaining <= 1:
        notify(f"🎬 ベキたんです。今日の Shorts を公開しました（{url_line}）。在庫が残り{remaining}本です、そろそろ次の収録を！")


if __name__ == "__main__":
    main()
