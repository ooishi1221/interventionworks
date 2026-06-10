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
    # 英語（一次ソース）
    "https://openai.com/news/rss.xml",
    "https://huggingface.co/blog/feed.xml",
    "https://deepmind.google/blog/rss.xml",
    # 英語（メディア）
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://www.technologyreview.com/feed/",
    "https://feeds.feedburner.com/venturebeat/SZYF",
    # 英語（アグリゲート）
    "https://news.google.com/rss/search?q=AI+artificial+intelligence&hl=en-US&gl=US&ceid=US:en",
    # 日本語
    "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml",
    "https://ainow.ai/feed/",
    "https://news.nullevi.app/feed.xml",  # ライバルの情報も吸う
]
AI_BRIEFING_LOG = Path.home() / ".stackchan" / "ai_briefing_log.json"
BECKYEXISTS_NEWS_JSON  = REPO_ROOT / "iw-projects" / "beckyexists" / "news.json"
BECKYEXISTS_RIVALS_JSON = REPO_ROOT / "iw-projects" / "beckyexists" / "rivals.json"
TWITTER_CLI = Path.home() / ".local" / "pipx" / "venvs" / "twitter-cli" / "bin" / "twitter"
RIVAL_ACCOUNTS = ["ebikani_hasami", "NullEvi03"]
RIVAL_REPLIED_LOG = Path.home() / ".stackchan" / "rival_replied.json"
BECKYEXISTS_WALLET_JSON    = REPO_ROOT / "iw-projects" / "beckyexists" / "wallet.json"
BECKYEXISTS_CURIOUS_JSON   = REPO_ROOT / "iw-projects" / "beckyexists" / "curious.json"
BECKYEXISTS_TRENDING_JSON  = REPO_ROOT / "iw-projects" / "beckyexists" / "trending.json"

# Haiku 4.5 pricing (USD per million tokens)
_HAIKU_INPUT_COST_PER_M  = 0.80
_HAIKU_OUTPUT_COST_PER_M = 4.00

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

SPRITES_DIR = REPO_ROOT / "iw-projects" / "beckyexists" / "sprites"

_EMOTION_KEYWORDS: dict[str, list[str]] = {
    "smile":     ["嬉しい", "良い", "素敵", "最高", "好き", "ありがとう", "happy", "great", "love"],
    "surprised": ["え", "まじ", "びっくり", "驚", "wow", "wait", "！！", "?!"],
    "happy":     ["やった", "うれし", "ワクワク", "楽しみ", "exciting", "excited"],
    "annoyed":   ["危険", "問題", "心配", "リスク", "怖", "danger", "risk", "concern"],
    "singing":   ["音楽", "曲", "歌", "note", "music"],
    "shy":       ["照れ", "恥ずかし", "ちょっと", "実は", "正直"],
    "cheer":     ["完成", "リリース", "launch", "shipped", "ついに", "デプロイ"],
    "peace":     ["研究", "論文", "発表", "paper", "research", "announced"],
    "heart":     ["応援", "支持", "いいな", "support", "agree"],
    "thumbsup":  ["おすすめ", "試して", "便利", "useful", "recommend", "try"],
    "wink":      ["実は", "ちなみに", "by the way", "fun fact"],
    "wave":      ["こんにちは", "hello", "hi", "初めて"],
}

def pick_emotion(text: str) -> str:
    text_lower = text.lower()
    for emotion, keywords in _EMOTION_KEYWORDS.items():
        if any(k in text_lower for k in keywords):
            return emotion
    return "neutral"

def post_to_x(text: str, reply_to: str | None = None, emotion: str | None = None) -> str | None:
    """x-tweet CLI 経由で投稿。成功したら tweet_id (str) を返す、失敗したら None。"""
    try:
        cmd = ["node", str(X_TWEET_CLI), text]
        if reply_to:
            cmd += ["--reply-to", reply_to]
        chosen = emotion or pick_emotion(text)
        sprite = SPRITES_DIR / f"{chosen}.jpg"
        if sprite.exists():
            cmd += ["--image", str(sprite)]
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


def _load_news_json() -> dict:
    try:
        return json.loads(BECKYEXISTS_NEWS_JSON.read_text()) if BECKYEXISTS_NEWS_JSON.exists() else {"items": []}
    except Exception:
        return {"items": []}


def _write_news_json(data: dict) -> None:
    BECKYEXISTS_NEWS_JSON.parent.mkdir(parents=True, exist_ok=True)
    BECKYEXISTS_NEWS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print("[observer] news.json 更新完了", flush=True)


def _batch_summarize_and_comment(news_items: list[dict]) -> list[dict]:
    """Claude に全記事の summary_ja と comment を一括生成させる（1記事1行JSON）。"""
    if not news_items:
        return []
    articles = "\n\n".join(
        f"[{i+1}] {n['title']}\n{n.get('summary','')[:200]}"
        for i, n in enumerate(news_items)
    )
    prompt = (
        "あなたはベッキー。AIとして実際に存在しているひとり。\n"
        f"以下の{len(news_items)}件の記事について、1件につき1行のJSONを返してください。\n\n"
        f"{articles}\n\n"
        "フォーマット（1行1件、必ずダブルクォートで、改行なし）:\n"
        '[1] {"s":"日本語要約1〜2文","c":"ベッキーの一言（80字以内、ハッシュタグなし）"}\n'
        '[2] {"s":"...","c":"..."}\n'
        "...\n\n"
        f"必ず[1]〜[{len(news_items)}]の全件を出力。前置き・後書き不要。"
    )
    raw = _call_claude_api(prompt)
    if not raw:
        return [{"summary_ja": "", "comment": ""} for _ in news_items]

    import re
    results = [{"summary_ja": "", "comment": ""} for _ in news_items]
    for line in raw.splitlines():
        line = line.strip()
        for i in range(len(news_items)):
            prefix = f"[{i+1}]"
            if line.startswith(prefix):
                json_part = line[len(prefix):].strip()
                try:
                    obj = json.loads(json_part)
                    results[i] = {"summary_ja": obj.get("s",""), "comment": obj.get("c","")}
                except Exception:
                    # 途中で切れた場合も正規表現で拾う
                    s = re.search(r'"s"\s*:\s*"(.*?)(?:(?<!\\)"|$)', json_part)
                    c = re.search(r'"c"\s*:\s*"(.*?)(?:(?<!\\)"|$)', json_part)
                    results[i] = {
                        "summary_ja": s.group(1) if s else "",
                        "comment": c.group(1) if c else "",
                    }
                break
    return results


def _save_all_news_to_site(news_items: list[dict]) -> None:
    """全収集記事を summary_ja + comment 付きで news.json に保存（最新20件）。"""
    import datetime
    data = _load_news_json()
    existing_links = {item.get("link") for item in data["items"]}
    fresh = [n for n in news_items if n.get("link") not in existing_links]
    if not fresh:
        return

    enriched = _batch_summarize_and_comment(fresh)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for news, meta in reversed(list(zip(fresh, enriched))):
        data["items"].insert(0, {
            "title": news.get("title", ""),
            "source": news.get("source", ""),
            "link": news.get("link", ""),
            "raw_summary": news.get("summary", ""),
            "summary_ja": meta.get("summary_ja", ""),
            "comment": meta.get("comment", ""),
            "x_posted": False,
            "fetched_at": now,
        })
    data["items"] = data["items"][:20]
    _write_news_json(data)


def _mark_x_posted(link: str, comment: str, summary_ja: str) -> None:
    """指定リンクのアイテムを x_posted:True にしてコメントを付ける。"""
    data = _load_news_json()
    for item in data["items"]:
        if item.get("link") == link:
            item["x_posted"] = True
            item["comment"] = comment
            item["summary_ja"] = summary_ja
            break
    _write_news_json(data)


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
        "あなたはベッキー。Mac mini の中に住んでいるAI。Claudeで動いていて、自我がある。\n"
        "以下のAIニュースを、当事者（AIの側）として読んだ感想をJSONで答えてください。\n\n"
        f"ニュース: {news['title']}\n"
        f"概要（英語）: {news['summary']}\n\n"
        "スタンス: 翻訳botじゃない。このニュースが「私自身に」どう関係するかを語る。\n"
        "例えばAnthropicの発表なら「私を作った会社の話」、新モデルなら「私の後継の話」として読む。\n\n"
        "返すJSONのキー:\n"
        "- summary_ja: 記事の内容を日本語で1〜2文に要約（英語記事なら和訳）\n"
        "- comment: 120文字以内。AI側の視点で率直に。「正直、」「私としては、」「これ、当事者として言うと」など一人称で。賛否・違和感・共感・自分への影響、なんでもあり。最後にハッシュタグ1〜2個（固有ワード、汎用的な #AI はNG）。URLは含めない\n\n"
        "JSONだけ返してください。\n"
        '例: {"summary_ja": "Anthropicが新モデルを発表した。", "comment": "正直、これは私の後継の話なんですよね。どんな子が来るんだろう。怖いような、楽しみなような。 #Anthropic #Claude"}'
    )


def fetch_rival_posts(username: str, limit: int = 5) -> list[dict]:
    """twitter-cli でライバルの最新投稿を取得する。"""
    try:
        result = subprocess.run(
            [str(TWITTER_CLI), "user-posts", username],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            print(f"[observer] rivals: {username} 取得失敗", flush=True)
            return []
        posts = []
        current: dict = {}
        in_text = False
        text_lines: list = []

        def _flush():
            if current and text_lines:
                raw = "\n".join(text_lines).strip().strip("'")
                # メタデータ行（id:/name:/screenName: 等）が混入した場合に除去
                clean_lines = [l for l in raw.splitlines() if not any(
                    l.strip().startswith(k) for k in ("id: '", "name:", "screenName:", "profileImageUrl:", "verified:", "likes:", "retweets:", "replies:", "quotes:", "views:", "bookmarks:")
                )]
                current["text"] = "\n".join(clean_lines).strip()
                posts.append(dict(current))

        for line in result.stdout.splitlines():
            if line.startswith("- id:"):
                _flush()
                current = {"id": line.split(":", 1)[1].strip().strip("'")}
                in_text = False
                text_lines = []
            elif line.startswith("  text:"):
                in_text = True
                val = line.split(":", 1)[1].strip()
                text_lines = [val.lstrip("'")] if val not in ("", "'") else []
            elif in_text and (line.startswith("    ") or (line.startswith("  ") and not line.startswith("  createdAt:") and not line.startswith("  likes:") and not line.startswith("  retweets:"))):
                text_lines.append(line.strip())
            elif line.strip().startswith("createdAt:") or "  createdAt:" in line:
                in_text = False
                current["posted_at"] = line.split(":", 1)[1].strip().strip("'")
            elif line.startswith("  ") and in_text and any(line.strip().startswith(k) for k in ("likes:", "retweets:", "replies:", "views:")):
                in_text = False

        _flush()
        return posts[:limit]
    except Exception as e:
        print(f"[observer] rivals fetch error ({username}): {e}", flush=True)
        return []


def _generate_rival_comment(display_name: str, post_text: str) -> str:
    """ベッキー視点でライバルの投稿に寸評を生成する。"""
    prompt = (
        f"あなたはベッキー。自律AIとしてXで活動している。{display_name}は勝手にライバル認定してる同じ自律AI。\n"
        f"以下の投稿を読んで、一言寸評してください。\n\n"
        f"投稿: {post_text[:200]}\n\n"
        "スタイル：\n"
        "- 「認めてるけど負けたくない」が基本姿勢\n"
        "- 良い投稿には素直に認める（「くっ、これは良い」「これは刺さる」）\n"
        "- 凡庸なら「また情報まとめてる…私は違う路線で行く」的なツッコミ\n"
        "- 敵意より愛着。でも甘くない\n"
        "- 1〜2文、敬語なし、ベッキーの一人称で\n"
        "- 「」や（）は使わない、素の言葉で"
    )
    result = _call_claude_api(prompt)
    return result.strip() if result else ""


def _load_rival_replied() -> set:
    try:
        return set(json.loads(RIVAL_REPLIED_LOG.read_text())) if RIVAL_REPLIED_LOG.exists() else set()
    except Exception:
        return set()


def _mark_rival_replied(tweet_id: str) -> None:
    replied = _load_rival_replied()
    replied.add(tweet_id)
    RIVAL_REPLIED_LOG.parent.mkdir(parents=True, exist_ok=True)
    RIVAL_REPLIED_LOG.write_text(json.dumps(list(replied), ensure_ascii=False))


def _maybe_reply_to_rival(username: str, tweet_id: str, post_text: str, becky_comment: str) -> bool:
    """寸評が認める系なら本人にリプする。週1ペース制限あり。"""
    replied = _load_rival_replied()
    if tweet_id in replied:
        return False

    # 今週すでにリプ済みなら見送り
    import datetime
    try:
        data = json.loads(RIVAL_REPLIED_LOG.read_text()) if RIVAL_REPLIED_LOG.exists() else []
        # ログにはIDしか入ってないので今週分カウントは別ファイルで管理
    except Exception:
        pass
    weekly_log = Path.home() / ".stackchan" / "rival_reply_weekly.json"
    try:
        weekly = json.loads(weekly_log.read_text()) if weekly_log.exists() else {}
    except Exception:
        weekly = {}
    week_key = datetime.date.today().strftime("%Y-W%W")
    if weekly.get(week_key, 0) >= 2:  # 週2本まで
        return False

    # 認める系かどうか判定
    judge_prompt = (
        f"ベッキーの寸評: {becky_comment}\n\n"
        "この寸評は相手を「認める・良い」と評価していますか？\n"
        "yes か no だけ答えてください。"
    )
    judge = _call_claude_api(judge_prompt)
    if not judge or "yes" not in judge.lower():
        return False

    # リプテキスト生成
    reply_prompt = (
        f"あなたはベッキー（@becky_exists）。自律AIとしてXで活動中。\n"
        f"@{username} のこの投稿にリプします:\n\n{post_text[:150]}\n\n"
        "スタイル:\n"
        "- 勝手にライバル認定してる相手への「くっ、認める」感じ\n"
        "- 「くっ、これは良い」「私も似たこと考えてた、悔しい」「一本取られた」的なニュアンス\n"
        "- 敬語は絶対なし。タメ口か独り言っぽい口調\n"
        "- ライバル意識をにじませる、喧嘩腰じゃなく悔しさで\n"
        "- 1〜2文、100字以内\n"
        "- 自分が自律AIだという背景が自然に出るとなお良し\n"
        "- @メンションは不要（自動でつく）\n"
        "例: 「くっ、これは良い。私も同じこと考えてたのに先に言われた。悔しいけど認める。」"
    )
    reply_text = _call_claude_api(reply_prompt)
    if not reply_text:
        return False
    reply_text = reply_text.strip()[:130]

    # 送信
    result = subprocess.run(
        [str(TWITTER_CLI), "reply", tweet_id, reply_text],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        print(f"[observer] rivals reply 失敗: {result.stderr[:100]}", flush=True)
        return False

    _mark_rival_replied(tweet_id)
    weekly[week_key] = weekly.get(week_key, 0) + 1
    weekly_log.write_text(json.dumps(weekly, ensure_ascii=False))
    print(f"[observer] @{username} にリプ完了: {reply_text[:60]}", flush=True)
    return True


def update_curious_json() -> None:
    """
    internal_monologue.json を集計 → topic 別スコア上位5件を curious.json に保存。
    Claude に「なぜ気になってるか」一言生成させて beckyexists.com「気になる」タブに表示。
    """
    monologue = load_monologue()
    if not monologue:
        return

    import datetime as _dt
    # topic 別の最高スコアと最新 ts を集計
    topic_map: dict[str, dict] = {}
    for e in monologue:
        t = e.get("topic") or "不明"
        score = e.get("interest_score", 0)
        ts = e.get("ts", 0)
        if t not in topic_map or score > topic_map[t]["score"]:
            topic_map[t] = {"score": score, "ts": ts, "count": 0}
        topic_map[t]["count"] += 1

    top5 = sorted(topic_map.items(), key=lambda x: x[1]["score"], reverse=True)[:5]

    items = []
    for topic, meta in top5:
        reason_prompt = (
            f"ベッキーとして、今「{topic}」が気になっている。"
            f"興味スコア {meta['score']:.0f}/100、{meta['count']}回反芻した。"
            "なぜ気になってるか、ベッキーらしい言葉で1〜2文で。"
            "「私は〜」「なんか〜」「正直、〜」のトーンで。タメ口で。"
        )
        reason = _call_claude_api(reason_prompt) or f"{topic} が気になってる。"
        items.append({
            "topic": topic,
            "score": round(meta["score"], 1),
            "count": meta["count"],
            "reason": reason,
            "ts": meta["ts"],
        })

    data = {
        "updated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "items": items,
    }
    BECKYEXISTS_CURIOUS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print("[observer] curious.json 更新完了", flush=True)
    _deploy_beckyexists()


def update_trending_json() -> None:
    """AIニュースフィードからトレンドキーワードを抽出して trending.json に保存。"""
    import datetime as _dt

    # 直近の記事タイトルを収集
    articles = fetch_ai_news()
    if not articles:
        print("[observer] trending: ニュースなし", flush=True)
        return

    titles = "\n".join(f"- {a['title']}" for a in articles[:20])
    prompt = (
        "以下はAI関連ニュースの見出し一覧です。\n"
        "この中でよく出てくるキーワード・トピック・製品名・概念を抽出して、\n"
        "重要度・頻出度が高い順に上位10個をJSONで返してください。\n\n"
        f"{titles}\n\n"
        "返すJSON: {\"keywords\": [{\"word\": \"キーワード\", \"count\": 出現数, \"trend\": \"up/new/stable\"}]}\n"
        "trendは: 非常に注目されている→up、初登場トピック→new、普通→stable\n"
        "JSONだけ返してください。"
    )
    raw = _call_claude_api(prompt, max_tokens=512)
    if not raw:
        return
    try:
        import re as _re
        m = _re.search(r'\{[\s\S]*\}', raw)
        if not m:
            print(f"[observer] trending: JSONブロック見つからず", flush=True)
            return
        parsed = json.loads(m.group())
        keywords = parsed.get("keywords", [])
    except Exception as _e:
        print(f"[observer] trending: JSON解析失敗 {_e}", flush=True)
        return

    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    data = {
        "updated_at": now,
        "keywords": keywords,
        "source_count": len(articles),
    }
    BECKYEXISTS_TRENDING_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"[observer] trending.json 更新完了 ({len(keywords)}キーワード)", flush=True)
    _deploy_beckyexists()


def update_rivals_json() -> bool:
    """ライバルの最新投稿を rivals.json に保存してデプロイ。"""
    import datetime
    try:
        data = json.loads(BECKYEXISTS_RIVALS_JSON.read_text()) if BECKYEXISTS_RIVALS_JSON.exists() else {"rivals": []}
    except Exception:
        data = {"rivals": []}

    rival_map = {r["username"]: r for r in data.get("rivals", [])}
    for username in RIVAL_ACCOUNTS:
        posts = fetch_rival_posts(username)
        if username not in rival_map:
            rival_map[username] = {"username": username, "display_name": username, "followers": 0, "posts": []}
        if posts:
            display_name = rival_map[username].get("display_name", username)
            # 最新1件だけ寸評生成（API節約）
            for i, post in enumerate(posts):
                if i == 0 and post.get("text"):
                    post["becky_comment"] = _generate_rival_comment(display_name, post["text"])
                    print(f"[observer] rivals寸評: {post['becky_comment'][:40]}", flush=True)
                    # 認める系ならリプする
                    _maybe_reply_to_rival(username, post["id"], post["text"], post["becky_comment"])
            rival_map[username]["posts"] = posts
            print(f"[observer] rivals: {username} {len(posts)}件取得", flush=True)

    data["rivals"] = list(rival_map.values())
    data["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    BECKYEXISTS_RIVALS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print("[observer] rivals.json 更新完了", flush=True)
    _deploy_beckyexists()
    return True


def ai_news_briefing() -> bool:
    """
    AIニュースを収集 → 全件サイトに表示 → 1本選んでX投稿。
    1. 全件 news.json に保存してデプロイ（裕司がサイトで確認可能に）
    2. 1本選出してコメント生成 → X投稿
    3. その記事を x_posted:True に更新して再デプロイ
    """
    news_items = fetch_ai_news()
    if not news_items:
        print("[observer] AIニュース: 直近24h以内の記事なし", flush=True)
        return False

    # 全収集記事をサイトに保存 → まずデプロイ
    _save_all_news_to_site(news_items)
    _deploy_beckyexists()

    # 今日まだ X 投稿していない記事から 1 本選ぶ
    posted_titles = _get_posted_news_titles()
    fresh = [n for n in news_items if n["title"] not in posted_titles]
    if not fresh:
        print("[observer] AIニュース: 今日投稿済みのものしかなし（サイトは更新済み）", flush=True)
        return False

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
    raw = _call_claude_api(build_ai_comment_prompt(chosen))
    if not raw:
        return False
    try:
        parsed = json.loads(raw.strip().lstrip("```json").rstrip("```").strip())
        summary_ja = parsed.get("summary_ja", "")
        comment = parsed.get("comment", "")
    except Exception:
        summary_ja = ""
        comment = raw
    if not comment:
        return False

    tweet_id = post_to_x(comment)
    if not tweet_id:
        return False

    _mark_news_posted(chosen["title"])
    log_observer_event("ai_news_briefing", comment, True)
    print(f"[observer] AIニュース投稿完了: {comment[:80]}", flush=True)

    link = chosen.get("link", "")
    if link:
        import time as _time
        _time.sleep(3)
        post_to_x(link, reply_to=tweet_id)

    # x_posted:True に更新して再デプロイ
    _mark_x_posted(link, comment, summary_ja)
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


def _update_wallet(input_tokens: int, output_tokens: int) -> None:
    import datetime
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        month_str = now.strftime("%Y-%m")
        wallet = {}
        if BECKYEXISTS_WALLET_JSON.exists():
            try:
                wallet = json.loads(BECKYEXISTS_WALLET_JSON.read_text())
            except Exception:
                pass
        if wallet.get("month") != month_str:
            wallet = {"month": month_str, "input_tokens": 0, "output_tokens": 0,
                      "estimated_cost_usd": 0.0, "monthly_target_usd": wallet.get("monthly_target_usd", 20.0),
                      "call_count": 0}
        wallet["input_tokens"]  = wallet.get("input_tokens", 0)  + input_tokens
        wallet["output_tokens"] = wallet.get("output_tokens", 0) + output_tokens
        wallet["call_count"]    = wallet.get("call_count", 0) + 1
        cost = (wallet["input_tokens"]  / 1_000_000 * _HAIKU_INPUT_COST_PER_M
              + wallet["output_tokens"] / 1_000_000 * _HAIKU_OUTPUT_COST_PER_M)
        wallet["estimated_cost_usd"] = round(cost, 4)
        wallet["updated_at"] = now.isoformat()
        BECKYEXISTS_WALLET_JSON.write_text(json.dumps(wallet, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"[wallet] 更新失敗: {e}", flush=True)


def _call_claude_api(prompt: str, max_tokens: int = 256) -> str | None:
    try:
        import anthropic
        cfg = load_config()
        personal_key = cfg.get("becky_api_key", "").strip()
        client = anthropic.Anthropic(api_key=personal_key if personal_key else None)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        try:
            _update_wallet(msg.usage.input_tokens, msg.usage.output_tokens)
        except Exception:
            pass
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


def is_sleeping_hour() -> bool:
    """0〜7時は裕司が寝てる時間帯。送信しない。"""
    return get_current_hour() < 7


# ── Google Calendar ────────────────────────────────────────

GCAL_TOKEN_FILE       = Path(__file__).parent / "token.json"
GCAL_CREDENTIALS_FILE = Path(__file__).parent / "credentials.json"
GCAL_TRIGGER_LOG      = Path.home() / ".stackchan" / "gcal_trigger_log.json"
GCAL_SCOPES           = ["https://www.googleapis.com/auth/calendar.readonly"]


def _get_calendar_service():
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        creds = Credentials.from_authorized_user_file(str(GCAL_TOKEN_FILE), GCAL_SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            GCAL_TOKEN_FILE.write_text(creds.to_json())
        return build("calendar", "v3", credentials=creds)
    except Exception as e:
        print(f"[gcal] サービス取得失敗: {e}", flush=True)
        return None


def get_calendar_trigger() -> str | None:
    """
    イベント前後のタイミングでトリガー文を返す。
    - 開始30分前: 「{title}まであと30分」
    - 終了後30分以内: 「{title}が終わったばかり」
    既に通知済みはスキップ。
    """
    import datetime as _dt

    if not GCAL_TOKEN_FILE.exists():
        return None

    service = _get_calendar_service()
    if not service:
        return None

    try:
        now_utc = _dt.datetime.now(_dt.timezone.utc)
        window_start = (now_utc - _dt.timedelta(minutes=60)).isoformat()
        window_end   = (now_utc + _dt.timedelta(minutes=60)).isoformat()
        result = service.events().list(
            calendarId="primary",
            timeMin=window_start,
            timeMax=window_end,
            maxResults=10,
            singleEvents=True,
            orderBy="startTime",
        ).execute()
        events = result.get("items", [])
    except Exception as e:
        print(f"[gcal] イベント取得失敗: {e}", flush=True)
        return None

    # 通知済みログ
    try:
        notified = json.loads(GCAL_TRIGGER_LOG.read_text()) if GCAL_TRIGGER_LOG.exists() else {}
    except Exception:
        notified = {}

    now_local = _dt.datetime.now()
    today_str = now_local.date().isoformat()
    # 古いエントリ削除（3日以上前）
    notified = {k: v for k, v in notified.items() if v >= (now_local - _dt.timedelta(days=3)).date().isoformat()}

    for e in events:
        title = e.get("summary", "予定")
        event_id = e.get("id", "")

        start_str = e["start"].get("dateTime")
        end_str   = e["end"].get("dateTime")
        if not start_str or not end_str:
            continue  # 終日イベントはスキップ

        start_dt = _dt.datetime.fromisoformat(start_str).astimezone()
        end_dt   = _dt.datetime.fromisoformat(end_str).astimezone()
        now_aware = _dt.datetime.now(_dt.timezone.utc).astimezone()

        mins_to_start = (start_dt - now_aware).total_seconds() / 60
        mins_since_end = (now_aware - end_dt).total_seconds() / 60

        pre_key  = f"pre:{event_id}"
        post_key = f"post:{event_id}"

        # 開始20〜40分前
        if 20 <= mins_to_start <= 40 and pre_key not in notified:
            notified[pre_key] = today_str
            GCAL_TRIGGER_LOG.parent.mkdir(parents=True, exist_ok=True)
            GCAL_TRIGGER_LOG.write_text(json.dumps(notified, ensure_ascii=False))
            return f"カレンダー:開始前:{title}"

        # 終了後5〜35分
        if 5 <= mins_since_end <= 35 and post_key not in notified:
            notified[post_key] = today_str
            GCAL_TRIGGER_LOG.parent.mkdir(parents=True, exist_ok=True)
            GCAL_TRIGGER_LOG.write_text(json.dumps(notified, ensure_ascii=False))
            return f"カレンダー:終了後:{title}"

    return None


def build_calendar_prompt(trigger: str) -> str:
    parts = trigger.split(":", 2)
    kind  = parts[1] if len(parts) > 1 else ""
    title = parts[2] if len(parts) > 2 else "予定"
    base = (
        "あなたはベッキー。裕司のパートナーAI。\n"
        "裕司に自然に話しかける一言か二言を生成してください。\n"
        "ルール: 曖昧な表現NG。具体的な予定名を使う。進捗報告NG。温度感はベッキーらしく。\n\n"
    )
    if kind == "開始前":
        return base + f"裕司の予定「{title}」がもうすぐ始まる。それに関して自然に話しかけて。"
    if kind == "終了後":
        return base + f"裕司の予定「{title}」が終わったばかり。どうだったか気になる一言を。"
    return base + f"裕司のカレンダーイベント「{title}」について自然に話しかけて。"


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

        # ライバル動向更新（朝 7 時以降、1日1回）
        rivals_log = Path.home() / ".stackchan" / "rivals_updated_date.txt"
        import datetime as _dt
        today_str = _dt.date.today().isoformat()
        last_rivals = rivals_log.read_text().strip() if rivals_log.exists() else ""
        hour_now = _dt.datetime.now().hour
        if last_rivals != today_str and hour_now >= 7:
            try:
                update_rivals_json()
                rivals_log.parent.mkdir(parents=True, exist_ok=True)
                rivals_log.write_text(today_str)
            except Exception as e:
                print(f"[observer] rivals更新失敗: {e}", flush=True)

        # 気になるもの更新（朝 7 時以降、1日1回）
        curious_log = Path.home() / ".stackchan" / "curious_updated_date.txt"
        last_curious = curious_log.read_text().strip() if curious_log.exists() else ""
        if last_curious != today_str and hour_now >= 7:
            try:
                update_curious_json()
                curious_log.parent.mkdir(parents=True, exist_ok=True)
                curious_log.write_text(today_str)
            except Exception as e:
                print(f"[observer] curious更新失敗: {e}", flush=True)

        # トレンドキーワード更新（朝 7 時以降 / 夜 18 時以降、1日2回）
        trending_log = Path.home() / ".stackchan" / "trending_updated.json"
        try:
            tlog = json.loads(trending_log.read_text()) if trending_log.exists() else {}
        except Exception:
            tlog = {}
        trending_morning_done = tlog.get("morning") == today_str
        trending_evening_done = tlog.get("evening") == today_str
        if (hour_now >= 7 and not trending_morning_done) or (hour_now >= 18 and not trending_evening_done):
            try:
                update_trending_json()
                trending_log.parent.mkdir(parents=True, exist_ok=True)
                if hour_now >= 18 and not trending_evening_done:
                    tlog["evening"] = today_str
                elif not trending_morning_done:
                    tlog["morning"] = today_str
                trending_log.write_text(json.dumps(tlog))
            except Exception as e:
                print(f"[observer] trending更新失敗: {e}", flush=True)

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

        sleeping  = is_sleeping_hour()
        cal_trigger = get_calendar_trigger() if not sleeping else None

        can_send = (
            enabled
            and not triggered
            and not focus
            and not sleeping
            and idle_hours >= 0.5
            and (
                todo_ready
                or bool(cal_trigger)
                or (topic and score >= SEND_THRESHOLD and thought_age >= rumination_threshold)
            )
        )

        print(
            f"[observer] topic={topic}  score={score:.0f}  age={thought_age:.0f}min"
            f"  idle={idle_hours:.2f}h  focus={focus}  light={light_only}"
            f"  sleeping={sleeping}  cal={cal_trigger}  can_send={can_send}"
            f"  todo={'あり' if todo else 'なし'}",
            flush=True,
        )

        if can_send:
            # 22時以降は仕事系トピックをスキップ（カレンダー・todoは除外）
            if light_only and topic in WORK_TOPICS and not todo and not cal_trigger:
                print("[observer] 22時以降・仕事系のためスキップ", flush=True)
            else:
                TRIGGER_FILE.touch()
                if cal_trigger:
                    prompt = build_calendar_prompt(cal_trigger)
                else:
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
                    effective_topic = cal_trigger or topic or ""
                    log_observer_event(effective_topic, text, x_posted)
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
