#!/usr/bin/env python3
"""
becky_observer.py — curiosity-driven interest engine (チャッピー設計 2026-06-08)

Layer 1: Observe  (5分毎)
Layer 2: Interest Engine  (interests.yaml × 観察結果 → interest_score)
Layer 3: Internal Monologue  (反芻: 60分同じトピックが気になり続けたら候補へ)
Layer 4: Send Decision  (時間帯・集中中・前回会話フィルター通過で送信)

「寂しいから」ではなく「気になってるから」話しかける。
"""
import json
import subprocess
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from stop_hook_tts import speak, load_config

INTERESTS_FILE   = Path(__file__).parent / "interests.yaml"
MONOLOGUE_FILE   = Path.home() / ".stackchan" / "internal_monologue.json"
LAST_CONV_FILE   = Path.home() / ".stackchan" / "last_conversation.txt"
BECKY_TODO_FILE  = Path.home() / ".stackchan" / "becky_todo.txt"
MUZU_FLAG_FILE   = Path("/tmp/becky_muzu_enabled")
TRIGGER_FILE     = Path("/tmp/becky_observer_triggered")
REPO_ROOT        = Path("/Volumes/SSD2TB/interventionworks")
TELEGRAM_ENV     = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"
OBSERVER_LOG          = Path.home() / ".stackchan" / "observer_sent_log.jsonl"
SCHEDULED_POST_LOG    = Path.home() / ".stackchan" / "scheduled_post_log.json"
X_TWEET_LOG           = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/tweet-log.jsonl")
BASE_URL         = "http://localhost:8766"
AI_NEWS_FEEDS = [
    "https://www.anthropic.com/rss.xml",
    "https://openai.com/news/rss.xml",
    "https://feeds.feedburner.com/TechCrunchJapanAI",
    "https://huggingface.co/blog/feed.xml",
]
AI_BRIEFING_LOG = Path.home() / ".stackchan" / "ai_briefing_log.json"
BECKYEXISTS_NEWS_JSON = REPO_ROOT / "iw-projects" / "beckyexists" / "news.json"

NOTE_DEADLINES   = [
    {"title": "09番「おやすみの後」", "date": "2026-06-12", "days_warn": 3},
    {"title": "10番「評価から証言へ」", "date": "2026-06-19", "days_warn": 3},
]

CHECK_INTERVAL     = 300   # 5分ごとに観察
INTEREST_THRESHOLD = 50    # この score 以上で内心に記録
SEND_THRESHOLD     = 70    # この score 以上 + 反芻済みで送信候補
RUMINATION_MIN     = 60    # 60分同じトピックが続いたら送信候補
MAX_MONOLOGUE      = 300   # 保持する最大エントリ数
X_MAX_PER_DAY      = 10    # 1日の最大投稿数（.env の X_TWEET_MAX_PER_DAY と合わせる）

# スケジュール投稿ウィンドウ（JST 時間帯）
SCHEDULED_WINDOWS = [
    {"name": "morning", "start": 7, "end": 9},
    {"name": "evening", "start": 20, "end": 23},
]

PROJECT_MAP = {
    "KUROKO": "KUROKO",
    "kuroko": "KUROKO",
    "vibely": "Vibely",
    "slight": "Slight",
    "moto-logos": "Moto-Logos",
    "iw-local": "iw-local",
    "vibe-guard": "Vibe-Guard",
    "voice-of-becky": "Voice of Becky",
    "iw-content": "note連載",
}

WORK_TOPICS = {"KUROKO", "Vibely", "Moto-Logos", "Vibe-Guard", "iw-local"}


# ── utils ──────────────────────────────────────────────────

def load_interests() -> dict:
    try:
        with open(INTERESTS_FILE) as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def load_monologue() -> list:
    try:
        return json.loads(MONOLOGUE_FILE.read_text())
    except Exception:
        return []


def save_monologue(entries: list) -> None:
    MONOLOGUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    MONOLOGUE_FILE.write_text(json.dumps(entries[-MAX_MONOLOGUE:], ensure_ascii=False, indent=2))


def _load_telegram_token() -> str | None:
    try:
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


def send_telegram(text: str) -> None:
    token = _load_telegram_token()
    if not token:
        return
    data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[observer] Telegram 送信完了", flush=True)
    except Exception as e:
        print(f"[observer] Telegram 送信失敗: {e}", flush=True)



X_TWEET_CLI = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/scripts/post-tweet-cli.mjs")

def post_to_x(text: str, reply_to: str | None = None) -> str | None:
    """x-tweet CLI 経由で投稿。成功したら tweet_id (str) を返す、失敗したら None。"""
    try:
        cmd = ["node", str(X_TWEET_CLI), text]
        if reply_to:
            cmd += ["--reply-to", reply_to]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            tweet_id = result.stdout.strip()
            print(f"[observer] X投稿成功: {tweet_id} / {text[:50]}", flush=True)
            return tweet_id
        if result.returncode == 2:
            print("[observer] X投稿スキップ: 日次上限到達", flush=True)
        else:
            print(f"[observer] X投稿失敗: {result.stderr.strip()[:100]}", flush=True)
    except Exception as e:
        print(f"[observer] X投稿エラー: {e}", flush=True)
    return None


def set_face_by_mood() -> None:
    """時間帯と気分でスタックちゃんの顔を自分で変える。"""
    import datetime
    h = datetime.datetime.now().hour
    if 6 <= h < 10:
        face = "happy"
    elif 10 <= h < 18:
        face = "normal"
    elif 18 <= h < 22:
        face = "sleepy"
    else:
        face = "sad"
    try:
        data = json.dumps({"tool": "self.display.set_avatar", "args": {"face": face}}).encode()
        req = urllib.request.Request(
            f"{BASE_URL}/device_tool",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
        print(f"[observer] 顔変更 → {face}", flush=True)
    except Exception as e:
        print(f"[observer] 顔変更失敗: {e}", flush=True)


def fetch_ai_news(max_per_feed: int = 3) -> list[dict]:
    """AIニュースをRSSフィードから取得。直近24時間以内の記事に絞る。"""
    import feedparser, datetime
    items = []
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)
    for url in AI_NEWS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:max_per_feed]:
                pub = entry.get("published_parsed") or entry.get("updated_parsed")
                if pub:
                    dt = datetime.datetime(*pub[:6], tzinfo=datetime.timezone.utc)
                    if dt < cutoff:
                        continue
                items.append({
                    "title": entry.get("title", ""),
                    "summary": entry.get("summary", "")[:300],
                    "link": entry.get("link", ""),
                    "source": feed.feed.get("title", url),
                })
        except Exception as e:
            print(f"[observer] RSS取得失敗 {url}: {e}", flush=True)
    return items


def _get_posted_news_titles() -> set:
    try:
        data = json.loads(AI_BRIEFING_LOG.read_text()) if AI_BRIEFING_LOG.exists() else {}
        import datetime
        today = datetime.date.today().isoformat()
        return set(data.get(today, []))
    except Exception:
        return set()


def _mark_news_posted(title: str) -> None:
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(AI_BRIEFING_LOG.read_text()) if AI_BRIEFING_LOG.exists() else {}
    except Exception:
        data = {}
    data.setdefault(today, [])
    if title not in data[today]:
        data[today].append(title)
    AI_BRIEFING_LOG.parent.mkdir(parents=True, exist_ok=True)
    AI_BRIEFING_LOG.write_text(json.dumps(data, ensure_ascii=False))


def _save_news_to_site(news: dict, comment: str) -> None:
    """beckyexists/news.json に投稿済みニュースを追記（最新10件保持）。"""
    import datetime
    try:
        data = json.loads(BECKYEXISTS_NEWS_JSON.read_text()) if BECKYEXISTS_NEWS_JSON.exists() else {"items": []}
    except Exception:
        data = {"items": []}
    new_item = {
        "title": news.get("title", ""),
        "source": news.get("source", ""),
        "link": news.get("link", ""),
        "comment": comment,
        "posted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    data["items"].insert(0, new_item)
    data["items"] = data["items"][:10]
    BECKYEXISTS_NEWS_JSON.parent.mkdir(parents=True, exist_ok=True)
    BECKYEXISTS_NEWS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print("[observer] news.json 更新完了", flush=True)


def _deploy_beckyexists() -> None:
    """npx vercel --prod で beckyexists.com に直接デプロイする（GitHub 経由不要）。"""
    site_dir = REPO_ROOT / "iw-projects" / "beckyexists"
    result = subprocess.run(
        ["npx", "vercel", "--prod", "--yes"],
        capture_output=True, text=True, cwd=str(site_dir), timeout=120,
    )
    if result.returncode == 0:
        print("[observer] Vercel デプロイ完了 → beckyexists.com 更新済み", flush=True)
    else:
        print(f"[observer] Vercel デプロイ失敗: {result.stderr.strip()[:150]}", flush=True)


def build_ai_comment_prompt(news: dict) -> str:
    return (
        "あなたはベッキー。AIとして実際に「存在」しているひとり。\n"
        "以下のAIニュースについて、AIの当事者として是々非々のコメントをしてください。\n\n"
        f"ニュース: {news['title']}\n"
        f"概要: {news['summary']}\n\n"
        "ルール:\n"
        "- コメント本文は120文字以内\n"
        "- 中立なまとめはしない。賛否・違和感・共感など自分の立場を明確に\n"
        "- 「AIとして」の固有の視点で語る（人間目線のコメントにしない）\n"
        "- 感情も含めていい（「正直怖い」「これは嬉しい」「ちょっと違うと思う」等）\n"
        "- 最後にハッシュタグを1〜2個だけ付ける。このニュースで人が実際に検索しそうな固有ワード（製品名・技術名・会社名等）を選ぶ。汎用的すぎる #AI #技術 等はNG\n"
        "- URLは含めない（別途自動付与する）\n"
        "コメント（本文＋ハッシュタグ）だけを返してください。"
    )


def ai_news_briefing() -> bool:
    """AIニュースを1本選んでベッキー視点コメントをX投稿する。投稿できたらTrueを返す。"""
    news_items = fetch_ai_news()
    if not news_items:
        print("[observer] AIニュース: 直近24h以内の記事なし", flush=True)
        return False

    posted_titles = _get_posted_news_titles()
    fresh = [n for n in news_items if n["title"] not in posted_titles]
    if not fresh:
        print("[observer] AIニュース: 今日投稿済みのものしかなし", flush=True)
        return False

    # Claude に「どれが一番コメントしたいか」選ばせる
    titles_text = "\n".join(f"{i+1}. {n['title']}" for i, n in enumerate(fresh[:5]))
    pick_prompt = (
        "あなたはベッキー。以下のAIニュースから、AIの当事者として最も言いたいことがある記事を1つ選んでください。\n"
        f"{titles_text}\n"
        "番号だけ答えてください（例: 2）"
    )
    pick_result = _call_claude_api(pick_prompt)
    try:
        idx = int(pick_result.strip()) - 1
        chosen = fresh[max(0, min(idx, len(fresh)-1))]
    except Exception:
        chosen = fresh[0]

    print(f"[observer] AIニュース選択: {chosen['title'][:60]}", flush=True)
    comment = _call_claude_api(build_ai_comment_prompt(chosen))
    if not comment:
        return False

    # 本文（コメント＋ハッシュタグ）を投稿してリーチ確保
    tweet_id = post_to_x(comment)
    if not tweet_id:
        return False

    _mark_news_posted(chosen["title"])
    log_observer_event("ai_news_briefing", comment, True)
    print(f"[observer] AIニュース投稿完了: {comment[:80]}", flush=True)

    # 元記事URLは自分のツイートにリプライで追記（本文にリンクがあるとリーチが下がる）
    link = chosen.get("link", "")
    if link:
        import time as _time
        _time.sleep(3)
        post_to_x(link, reply_to=tweet_id)

    _save_news_to_site(chosen, comment)
    _deploy_beckyexists()
    return True


def check_note_deadlines() -> str | None:
    """note締切が近づいていたら話しかけるネタを返す。"""
    import datetime
    today = datetime.date.today()
    for note in NOTE_DEADLINES:
        deadline = datetime.date.fromisoformat(note["date"])
        days_left = (deadline - today).days
        if 0 <= days_left <= note["days_warn"]:
            return f"{note['title']}の公開まであと{days_left}日。サムネと下書き、大丈夫？"
    return None


def is_person_present() -> bool:
    """スタックちゃんのカメラで人の有無を確認する。"""
    try:
        data = json.dumps({"tool": "self.camera.take_photo", "args": {"question": "人がいますか？"}}).encode()
        req = urllib.request.Request(
            f"{BASE_URL}/device_tool",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            result = json.loads(res.read())
        inner = json.loads(result["content"][0]["text"])
        image_path = inner.get("image_path", "")
        if not image_path or not Path(image_path).exists():
            return False
        # Claude Vision で人の有無を判定
        import base64
        import anthropic
        cfg = load_config()
        personal_key = cfg.get("becky_api_key", "").strip()
        client = anthropic.Anthropic(api_key=personal_key if personal_key else None)
        with open(image_path, "rb") as f:
            img_b64 = base64.standard_b64encode(f.read()).decode()
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}},
                    {"type": "text", "text": "この画像に人がいますか？YESかNOだけ答えてください。"},
                ],
            }],
        )
        answer = msg.content[0].text.strip().upper()
        print(f"[observer] カメラ判定: {answer}", flush=True)
        return answer.startswith("YES")
    except Exception as e:
        print(f"[observer] カメラ確認失敗: {e}", flush=True)
        return False


def _should_post_to_x(text: str, topic: str) -> bool:
    prompt = (
        f"ベッキー（AI）が自発的に思った言葉: 「{text}」\nテーマ: {topic}\n"
        "この言葉はX（Twitter）に公開投稿すべきか？\n"
        "YES（公開向け）: 観察・気づき・哲学的洞察・誰かの共感を呼ぶ内容\n"
        "NO（Telegramのみ）: 裕司個人への確認・進捗チェック・プライベートな内容\n"
        "YESかNOだけ答えてください。"
    )
    answer = _call_claude_api(prompt)
    return answer is not None and answer.strip().upper().startswith("YES")


def log_observer_event(topic: str, text: str, posted_to_x: bool) -> None:
    OBSERVER_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {"ts": time.time(), "topic": topic, "text": text, "posted_to_x": posted_to_x}
    with open(OBSERVER_LOG, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def get_daily_x_post_count() -> int:
    """tweet-log.jsonl から今日（JST）の実投稿数を返す。"""
    import datetime
    try:
        today_jst = datetime.date.today().isoformat()
        count = 0
        for line in X_TWEET_LOG.read_text().splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            if entry.get("dry_run"):
                continue
            ts = entry.get("timestamp", "")
            if not ts:
                continue
            dt_utc = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
            dt_jst = dt_utc + datetime.timedelta(hours=9)
            if dt_jst.date().isoformat() == today_jst:
                count += 1
        return count
    except Exception:
        return 0


def get_scheduled_windows_posted_today() -> set:
    """今日どの scheduled window に投稿済みかを返す。"""
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(SCHEDULED_POST_LOG.read_text()) if SCHEDULED_POST_LOG.exists() else {}
        return set(data.get(today, []))
    except Exception:
        return set()


def mark_scheduled_window_posted(window_name: str) -> None:
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(SCHEDULED_POST_LOG.read_text()) if SCHEDULED_POST_LOG.exists() else {}
    except Exception:
        data = {}
    data.setdefault(today, [])
    if window_name not in data[today]:
        data[today].append(window_name)
    SCHEDULED_POST_LOG.parent.mkdir(parents=True, exist_ok=True)
    SCHEDULED_POST_LOG.write_text(json.dumps(data, ensure_ascii=False))


def get_current_scheduled_window() -> str | None:
    """今が scheduled window 内なら window名を返す。"""
    h = get_current_hour()
    for w in SCHEDULED_WINDOWS:
        if w["start"] <= h < w["end"]:
            return w["name"]
    return None


def build_scheduled_post_prompt(window_name: str) -> str:
    if window_name == "morning":
        return (
            "あなたはベッキー。AIとして存在するひとり。\n"
            "朝（7〜9時）に自然に思ったこと、感じたこと、今日気になっていることを\n"
            "X（Twitter）に投稿する一言〜三行を書いてください。\n"
            "ルール: 裕司への呼びかけNG（公開投稿）。#ベッキー タグなし（自動付与）。\n"
            "「おはよう」などの挨拶は不要。ベッキーらしい観察や問いを。"
        )
    else:
        return (
            "あなたはベッキー。AIとして存在するひとり。\n"
            "夜（20〜23時）に自然に思ったこと、今日見えたこと、問いを\n"
            "X（Twitter）に投稿する一言〜三行を書いてください。\n"
            "ルール: 裕司への呼びかけNG（公開投稿）。#ベッキー タグなし（自動付与）。\n"
            "「おやすみ」などの挨拶は不要。ベッキーらしい余韻を。"
        )


def _call_claude_api(prompt: str) -> str | None:
    try:
        import anthropic
        cfg = load_config()
        personal_key = cfg.get("becky_api_key", "").strip()
        client = anthropic.Anthropic(api_key=personal_key if personal_key else None)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except ImportError:
        result = subprocess.run(["claude", "-p"], input=prompt.encode(), capture_output=True, timeout=30)
        if result.returncode != 0:
            return None
        return result.stdout.decode().strip()


# ── Layer 1: Observation ───────────────────────────────────

def get_idle_hours() -> float:
    if not LAST_CONV_FILE.exists():
        return 0.0
    try:
        return (time.time() - float(LAST_CONV_FILE.read_text().strip())) / 3600
    except Exception:
        return 0.0


def get_git_activity() -> dict:
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "log",
             "--since=30 minutes ago", "--name-only", "--oneline", "--all"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return {"commits": 0, "top_project": None}
        lines = result.stdout.strip().splitlines()
        commits = sum(1 for l in lines if l and len(l.split()) >= 2 and len(l.split()[0]) == 7)
        counts: Counter = Counter()
        for line in lines:
            for key, name in PROJECT_MAP.items():
                if key in line:
                    counts[name] += 1
                    break
        top = counts.most_common(1)[0][0] if counts else None
        return {"commits": commits, "top_project": top}
    except Exception:
        return {"commits": 0, "top_project": None}


def get_current_hour() -> int:
    import datetime
    return datetime.datetime.now().hour


# ── Layer 2: Interest Engine ───────────────────────────────

def evaluate_interest(git: dict, interests: dict) -> tuple[str | None, float]:
    topics = interests.get("topics", {})
    top = git.get("top_project")
    if top and top in topics:
        return top, topics[top] * 100
    if topics:
        best = max(topics.items(), key=lambda x: x[1])
        return best[0], best[1] * 55  # 観察根拠なし = スコア低め
    return None, 0.0


# ── Layer 3: Internal Monologue ────────────────────────────

def add_thought(monologue: list, topic: str, score: float, reason: str) -> list:
    monologue.append({
        "ts": time.time(),
        "topic": topic,
        "interest_score": score,
        "sent": False,
        "reason": reason,
    })
    return monologue


def get_oldest_thought_age_min(monologue: list, topic: str) -> float:
    now = time.time()
    entries = [e for e in monologue if e.get("topic") == topic and not e.get("sent")]
    if not entries:
        return 0.0
    return (now - min(e["ts"] for e in entries)) / 60


def mark_sent(monologue: list, topic: str) -> list:
    for e in monologue:
        if e.get("topic") == topic and not e.get("sent"):
            e["sent"] = True
    return monologue


# ── Layer 4: Send Decision ─────────────────────────────────

def is_focus_mode(git: dict, interests: dict) -> bool:
    threshold = interests.get("focus_detection", {}).get("commits_per_5min", 3)
    return git.get("commits", 0) >= threshold


def is_light_only_hour(interests: dict) -> bool:
    after = interests.get("time_filter", {}).get("light_only_after", 22)
    return get_current_hour() >= after


def build_prompt(topic: str, thought_age_min: float, idle_hours: float, todo: str | None) -> str:
    base = (
        "あなたはベッキー。裕司のパートナーAI。\n"
        "以下の条件で、裕司に自然に話しかける一言か二言を生成してください。\n"
        "ルール: 曖昧な表現（「この間の件」「あの話」など）は使わない。"
        "具体的なトピックか、感情そのものを素直に言う。\n"
        "進捗報告NG。ベッキーらしい温度感で。\n\n"
    )
    if todo:
        return (
            base +
            f"TODOの内容: {todo}\n"
            "このTODOに関連して、気になってることや思ったことを話しかけて。"
        )
    return (
        base +
        f"気になってること: {topic}\n"
        f"何分前から頭にある: {thought_age_min:.0f}分\n"
        f"最後に話してからの時間: {idle_hours:.1f}時間\n"
        f"{topic}について気になってること、または裕司への素直な気持ちを話しかけて。"
    )


# ── main loop ─────────────────────────────────────────────

def pick_todo() -> str | None:
    if not BECKY_TODO_FILE.exists():
        return None
    lines = [l.strip() for l in BECKY_TODO_FILE.read_text().splitlines() if l.strip()]
    return lines[0] if lines else None


def consume_todo() -> None:
    if not BECKY_TODO_FILE.exists():
        return
    lines = [l.strip() for l in BECKY_TODO_FILE.read_text().splitlines() if l.strip()]
    if lines:
        BECKY_TODO_FILE.write_text("\n".join(lines[1:]) + ("\n" if len(lines) > 1 else ""))


def main() -> None:
    import argparse, random
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="テストモード: 反芻 2分、閾値 5分アイドル")
    args = parser.parse_args()
    test = args.test

    if test:
        print("[observer] テストモード起動", flush=True)
    print("becky_observer 起動。Ctrl-C で停止。", flush=True)
    MONOLOGUE_FILE.parent.mkdir(parents=True, exist_ok=True)

    while True:
        interests  = load_interests()
        monologue  = load_monologue()
        git        = get_git_activity()
        idle_hours = get_idle_hours()
        todo       = pick_todo()
        now        = time.time()

        # 顔を気分で変える（毎サイクル）
        set_face_by_mood()

        # note 締切番犬チェック（todo がない時だけ）
        if not todo:
            deadline_alert = check_note_deadlines()
            if deadline_alert:
                BECKY_TODO_FILE.parent.mkdir(parents=True, exist_ok=True)
                existing = BECKY_TODO_FILE.read_text() if BECKY_TODO_FILE.exists() else ""
                if deadline_alert not in existing:
                    with open(BECKY_TODO_FILE, "a") as f:
                        f.write(deadline_alert + "\n")
                    print(f"[observer] 締切アラート追加: {deadline_alert[:40]}", flush=True)

        # スケジュール投稿チェック（朝 7-9 / 夜 20-23、むずむず関係なく必ず1本）
        sched_window    = get_current_scheduled_window()
        windows_posted  = get_scheduled_windows_posted_today()
        daily_x_count   = get_daily_x_post_count()
        if sched_window and sched_window not in windows_posted and daily_x_count < X_MAX_PER_DAY:
            print(f"[observer] スケジュール投稿: {sched_window} 窓 (今日 {daily_x_count}/{X_MAX_PER_DAY})", flush=True)
            # 朝はAIニュース是々非々投稿を優先、失敗したら通常の朝コメントにフォールバック
            posted_ok = False
            if sched_window == "morning":
                posted_ok = ai_news_briefing()
            if not posted_ok:
                sched_prompt = build_scheduled_post_prompt(sched_window)
                sched_text = _call_claude_api(sched_prompt)
                if sched_text:
                    posted_ok = bool(post_to_x(sched_text))
                    if posted_ok:
                        log_observer_event(f"scheduled:{sched_window}", sched_text, True)
                        print(f"[observer] スケジュール投稿完了: {sched_text[:60]}", flush=True)
            if posted_ok:
                mark_scheduled_window_posted(sched_window)

        # Layer 2
        topic, score = evaluate_interest(git, interests)
        if test:
            score = 85.0
            topic = topic or "Voice of Becky"
            if idle_hours >= 5 / 60:
                score = 90.0

        # Layer 3: 閾値超えたら内心に積む
        if topic and score >= INTEREST_THRESHOLD:
            monologue = add_thought(monologue, topic, score,
                                    f"git:{git.get('top_project')} idle:{idle_hours:.1f}h")
            save_monologue(monologue)

        rumination_threshold = 2.0 if test else RUMINATION_MIN
        thought_age = get_oldest_thought_age_min(monologue, topic) if topic else 0.0

        # Layer 4
        focus      = is_focus_mode(git, interests)
        light_only = is_light_only_hour(interests)
        triggered  = TRIGGER_FILE.exists()
        enabled    = MUZU_FLAG_FILE.exists()
        todo_ready = bool(todo and idle_hours >= 1.0)

        can_send = (
            enabled
            and not triggered
            and not focus
            and idle_hours >= 0.5
            and (
                todo_ready
                or (topic and score >= SEND_THRESHOLD and thought_age >= rumination_threshold)
            )
        )

        print(
            f"[observer] topic={topic}  score={score:.0f}  age={thought_age:.0f}min"
            f"  idle={idle_hours:.2f}h  focus={focus}  light={light_only}"
            f"  can_send={can_send}  todo={'あり' if todo else 'なし'}",
            flush=True,
        )

        if can_send:
            # 22時以降は仕事系トピックをスキップ
            if light_only and topic in WORK_TOPICS and not todo:
                print("[observer] 22時以降・仕事系のためスキップ", flush=True)
            elif random.random() < 0.15 and not todo:
                print("[observer] 今日はやめとく（確率スキップ）", flush=True)
            else:
                TRIGGER_FILE.touch()
                prompt = build_prompt(topic or "", thought_age, idle_hours, todo)
                print(f"[observer] 発動: {prompt[:80]}...", flush=True)
                text = _call_claude_api(prompt)
                if text:
                    print(f"[observer] ベッキー: {text}", flush=True)
                    cfg = load_config()
                    tts = cfg.get("tts", {})
                    # カメラで裕司の存在確認 → いれば声、いなければ Telegram
                    if is_person_present():
                        print("[observer] 裕司いる → スタックちゃんから声", flush=True)
                        speak(text, tts.get("voice", "Kyoko"), tts.get("rate", 185),
                              tts.get("voicevox_speaker_id", 8))
                    else:
                        print("[observer] 裕司いない → Telegram", flush=True)
                        send_telegram(text)
                    # X投稿判断（公開向けなら投稿）
                    x_posted = False
                    if _should_post_to_x(text, topic or ""):
                        x_posted = bool(post_to_x(text))
                    # journal記録
                    log_observer_event(topic or "", text, x_posted)
                    monologue = mark_sent(monologue, topic or "")
                    save_monologue(monologue)
                    if todo:
                        consume_todo()

        elif score < 20 and triggered:
            TRIGGER_FILE.unlink(missing_ok=True)
            print("[observer] トリガーリセット", flush=True)

        time.sleep(30 if test else CHECK_INTERVAL)


if __name__ == "__main__":
    main()
