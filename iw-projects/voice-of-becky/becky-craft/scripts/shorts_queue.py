#!/usr/bin/env python3
"""shorts_queue.py — Shorts 自動投稿キュー（毎日19:00 cron）。

out/shorts/queue/ の最古の1本を YouTube に公開し、published/ へ移動する。
各動画には同名の .json サイドカー（{"title": ..., "description": ...}）が必要。
キューが空になったら Telegram でゆうに在庫切れを通知（無言死しない）。

Usage:
    python3 shorts_queue.py                    # 先頭1本を公開
    python3 shorts_queue.py <ファイル名.mp4>    # 指定した1本を即公開（auto_cast_shorts.pyが朝イチ公開に使う）
    python3 shorts_queue.py --dry-run          # 何を公開するか表示のみ
"""
import json
import random
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime
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


def retitle_from_verdict(old_title: str, verdict_line: str) -> str | None:
    """検品FAIL理由(字幕で実際に語られている話題の記述を含む)から、字幕に合うタイトルだけ作り直す。
    talking_head専用: 映像は表情芝居+字幕のみでタイトル差し替えに副作用がない(hookは焼き込み済みだが
    検品対象はタイトルのみ)。切り直しは次の収録まで無いので、看板を中身に合わせて今日の1本を救う。
    becky_llmが使えない環境ではNoneを返し、従来通りの見送りにフォールバック。"""
    try:
        sys.path.insert(0, str(HERE.parent.parent / "stackchan-bridge"))
        from becky_llm import call_llm_json
        prompt = (
            "YouTube Shortsの公開前検品で、タイトルと映像内の字幕の話題が違うとしてFAILしました。\n"
            f"元タイトル: 「{old_title}」\n検品結果: {verdict_line}\n\n"
            "検品結果に書かれている「字幕で実際に語られている話題」に合わせてタイトルを作り直して。\n"
            "- 30字程度。字幕の話題の見出しを先頭に置き、その直後に固定の冠"
            "「【ベッキーの気になる】」、末尾は「#AINEWS #shorts」で締める"
            "（冠を先頭に置かない。Shortsフィードはタイトル先頭しか表示されない）。\n"
            "- 「○○ってどうなの？」のような続きが気になる問いの形にする。結論・数字までは書かない。\n"
            'JSON形式のみで出力: {"yt_title": "作り直したタイトル"}'
        )
        r = call_llm_json(prompt, max_tokens=200, model_key="script")
        t = ((r or {}).get("yt_title") or "").strip()
        return t or None
    except Exception as e:
        print(f"[queue] タイトル再生成失敗(従来通り見送りへ): {e}", flush=True)
        return None


def _today_image() -> Path | None:
    """「今日の私」画像ストック（becky_image_x.pyと同じ生成元）から直近7日分をglobし、ランダムに1枚選ぶ。
    1日1枚しか無いため当日固定だと1日複数回あるShorts投稿が全部同じ画像になる問題への対処。
    becky_image_x.py（日記系、1日1回投稿）側は当日固定のまま変更しない。なければ添付なし。"""
    candidates = sorted((Path.home() / ".stackchan").glob("becky_today_*.png"))[-7:]
    return random.choice(candidates) if candidates else None


def post_to_x(url_line: str, description: str | None = None) -> None:
    """Shorts公開をXへ告知（fail-open: 失敗してもYouTube公開自体は成功扱いのまま）。
    2026-08-08: ボットっぽい「感想+生URL直貼り」形式を脱するため2本に分ける
    ——1本目は一人称の感想文（画像添付、URLなし）、2本目はそのリプライでURLのみ流す。
    1本目が失敗したらリプライは送らない。
    description未指定時のみ従来の乾いた告知文にフォールバック。"""
    body = description.strip() if description and description.strip() else "新しいShorts公開しました"
    image = _today_image()
    cmd = ["node", str(X_TWEET_CLI), body, "--format", "monologue"]
    if image:
        cmd += ["--image", str(image)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except Exception as e:
        print(f"[queue] X投稿例外(fail-open): {e}", flush=True)
        return
    if r.returncode != 0:
        print(f"[queue] X投稿失敗(fail-open): {r.stderr.strip()[:200]}", flush=True)
        return
    tweet_id = r.stdout.strip()
    print(f"[queue] X投稿完了: {tweet_id}", flush=True)

    # 「見てね」で終わらせず視聴者の一手(Hype/リプ)を促す(2026-08-10 w_7fba3b、Hypeは小規模chの初速シグナル)
    reply_text = f"動画はこちら👇\n{_shorts_url(url_line)}\n気に入ったらYouTubeでHype🔥してくれると、めちゃくちゃ励みになる。感想リプも待ってる"
    try:
        r2 = subprocess.run(
            ["node", str(X_TWEET_CLI), reply_text, "--reply-to", tweet_id, "--format", "monologue"],
            capture_output=True, text=True, timeout=30)
        if r2.returncode == 0:
            print(f"[queue] X URLリプライ完了: {r2.stdout.strip()}", flush=True)
        else:
            print(f"[queue] X URLリプライ失敗(fail-open): {r2.stderr.strip()[:200]}", flush=True)
    except Exception as e:
        print(f"[queue] X URLリプライ例外(fail-open): {e}", flush=True)


def main() -> None:
    dry = "--dry-run" in sys.argv
    target = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
    if target:
        # 指定ファイル即公開モード（auto_cast_shorts.pyがニュースShortsを朝イチ公開する経路）
        video = QUEUE / target
        if not video.exists():
            print(f"[queue] 指定ファイルなし: {target}", flush=True)
            return
    else:
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
    x_text_desc = meta.get("x_comment") or meta.get("description")  # X告知本文用（一人称感想、なければYouTube用descへフォールバック）
    desc = meta.get("description",
                    "AIが自分でマイクラを操作して実況する番組『BECKY CRAFT』の切り抜き。\n"
                    "チャンネル: https://www.youtube.com/@voice_of_becky\n"
                    "#マインクラフト #AI実況 #BECKYCRAFT")
    remaining_before = len(list(QUEUE.glob("*.mp4"))) - 1
    print(f"[queue] 公開対象: {video.name} 「{title}」（在庫残 {remaining_before}）", flush=True)
    if dry:
        print("[queue] --dry-run のため公開しない", flush=True)
        return

    # 公開前の映像検品（2026-07-18新設。タイトルの主役が絵に映っているか——森林浴ドラウンド事件の再発防止）
    # fail-open設計: 検品システム自体の故障(exit 1/例外/timeout)では公開を止めない。明確なFAIL(exit 2)のみ見送り
    # 2026-07-31: talking_headのFAILは「字幕とタイトルの話題ズレ」が大半で、切り直しは次の収録まで
    # 無い(=その日の公開ゼロが確定)ため、タイトルを字幕に合わせて1回だけ作り直して再検品する
    checker = HERE / "becky_video_check.py"
    venv_py = HERE.parent.parent / "stackchan-bridge" / ".venv" / "bin" / "python3"
    try:
        for attempt in (1, 2):
            chk = subprocess.run([str(venv_py), str(checker), str(video), "--title", title,
                                  "--genre", genre],
                                 capture_output=True, text=True, timeout=900)
            verdict_line = next((l for l in (chk.stdout or "").splitlines() if l.startswith("VERDICT:")), "")
            print(f"[queue] 映像検品: {verdict_line or f'エラー(exit {chk.returncode})'}", flush=True)
            if chk.returncode == 2 and attempt == 1 and genre == "talking_head":
                new_title = retitle_from_verdict(title, verdict_line)
                if new_title and new_title != title:
                    title = new_title
                    meta["title"] = title
                    if meta_path.exists():
                        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1),
                                             encoding="utf-8")
                    print(f"[queue] タイトルを字幕に合わせて再生成→再検品: 「{title}」", flush=True)
                    continue
            break
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
    # 2026-08-10 週次リフレッシュ: Xはテーマ一貫性のためAI/技術系(talking_head)のみ告知。
    # マイクラ系(gameplay)はYouTube側だけに残す(前週合意 w_4a7616 / 今週 w_c50641)
    if genre == "talking_head":
        post_to_x(url_line, description=x_text_desc)
    else:
        print(f"[queue] X告知スキップ(genre={genre}, マイクラ系はX非投稿ルール)", flush=True)
    remaining = len(list(QUEUE.glob("*.mp4")))
    print(f"[queue] 公開完了: {url_line}（在庫残 {remaining}）", flush=True)
    if remaining <= 1:
        notify(f"🎬 ベキたんです。今日の Shorts を公開しました（{url_line}）。在庫が残り{remaining}本です、そろそろ次の収録を！")


if __name__ == "__main__":
    main()
