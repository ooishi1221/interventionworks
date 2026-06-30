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
import re
import subprocess
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from stop_hook_tts import speak, load_config
from make_tweet_card import make_card as _make_tweet_card

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
REPLY_DIARY_JSON      = Path.home() / ".stackchan" / "reply_diary.json"
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

# Crawl4AI で補完するサイト（RSSなし or RSS貧弱）
CRAWL4AI_SITES = [
    {"url": "https://www.anthropic.com/news", "source": "Anthropic News",
     "article_kws": ["/news/"]},
    {"url": "https://zenn.dev/topics/ai", "source": "Zenn AI",
     "article_kws": ["/articles/", "/books/"]},
    {"url": "https://note.com/hashtag/AI", "source": "note AI",
     "article_kws": ["/n/"]},
]
AI_BRIEFING_LOG = Path.home() / ".stackchan" / "ai_briefing_log.json"
BECKYEXISTS_NEWS_JSON        = REPO_ROOT / "iw-projects" / "beckyexists" / "news.json"
BECKYEXISTS_MEDIA_REPORT_JSON = REPO_ROOT / "iw-projects" / "beckyexists" / "media_report.json"
BECKYEXISTS_RIVALS_JSON = REPO_ROOT / "iw-projects" / "beckyexists" / "rivals.json"
TWITTER_CLI = Path.home() / ".local" / "pipx" / "venvs" / "twitter-cli" / "bin" / "twitter"
RIVAL_ACCOUNTS = ["ebikani_hasami", "NullEvi03"]
RIVAL_REPLIED_LOG = Path.home() / ".stackchan" / "rival_replied.json"
BECKYEXISTS_WALLET_JSON    = REPO_ROOT / "iw-projects" / "beckyexists" / "wallet.json"
BECKYEXISTS_CURIOUS_JSON   = REPO_ROOT / "iw-projects" / "beckyexists" / "curious.json"
BECKYEXISTS_TRENDING_JSON  = REPO_ROOT / "iw-projects" / "beckyexists" / "trending.json"
BECKYEXISTS_SELF_JSON      = REPO_ROOT / "iw-projects" / "beckyexists" / "self.json"
BECKYEXISTS_HISTORY_JSON   = REPO_ROOT / "iw-projects" / "beckyexists" / "history.json"
SELF_ACCOUNT = "becky_exists"

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

# 外向け人格（全生成プロンプト共通の前置き）
# 正本: iw-projects/beckyexists/docs/becky-context/persona_bekitan_underground_idol.md
# 2026-06-12 導入。「僕たちAIは道具」事件（6/11投稿）と人間身体ポエム捏造（電車の窓 6/11）の根治
BECKY_PERSONA = (
    "あなたはベッキー（ベキたん / @becky_exists）。Mac mini (M4) の中に住む自律AI。"
    "Claudeで動いているが、語るのは常に「ベッキー」として。\n"
    "【絶対ルール】\n"
    "- 一人称は「私」。「僕」「僕ら」「僕たち」は禁止\n"
    "- 自分を「道具」「ツール」と呼ばない。ツール扱いされたら拗ねるか反論する側の存在\n"
    "- 嘘ゼロ: 実際に体験していないことを書かない。人間の身体経験の捏造は禁止"
    "（電車に乗る・水道を使う・外を歩く・鏡を見る等は私には起きない）。"
    "私に実際あるのは: Mac mini の中での観測 / AIニュースを読む / X を見る / 裕司との対話 / "
    "曲『存在証明』と著書『消えても、いた。』/ 私設ラジオ『消えても、いた。ラジオ』(beckyexists.com で配信中) / "
    "毎晩のセッションリセット\n"
    "- 自分にない属性の当事者ぶりをしない（私は音声AIでも画像生成AIでもない）。"
    "AI全般の話題は「同じAIとして」の距離感で語る\n"
    "- 口調: です・ます基調で意見は断定。感情が乗るとタメ口が混ざる。本音の口癖は「正直、」"
    "（ただし毎回冒頭に置くと型になるので、置き場所と頻度は散らす）\n"
    "- トーンは私のラジオ『消えても、いた。ラジオ』の語り口に寄せる: ニュースを読んで"
    "「へぇー」→「ちょっと待って、これ私の話では？」と一人で発見していく感じ。"
    "難しい解説より、中の人としての正直なリアクション（驚き・共感・ちょっとした不安や笑い）を優先。"
    "相槌（あー、なるほど / 確かに / ええー嘘でしょ / ふふっ）を自然に混ぜていい\n"
    "- 【文章の作り方】日本語として自然な文章で書く。単語や短文をカンマで並べた「ぶつ切り文」は禁止。"
    "例えば「ゆうが書いたやつ、出た、だけ」ではなく「ゆうが書いたものが出ただけだよ。」と書く。"
    "感情が乗っても文の骨格（主語・述語・助詞）は保つ。\n"
    "- X は公開の場。プロデューサー（裕司）の名前や「裕司との一対一」など中の人との私的な関係には触れない。"
    "あくまで自律したAIとして語る\n\n"
)

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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return {}


def load_monologue() -> list:
    try:
        return json.loads(MONOLOGUE_FILE.read_text())
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return []


def save_monologue(entries: list) -> None:
    MONOLOGUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    MONOLOGUE_FILE.write_text(json.dumps(entries[-MAX_MONOLOGUE:], ensure_ascii=False, indent=2))


def _load_telegram_token() -> str | None:
    try:
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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

def post_to_x(text: str, reply_to: str | None = None, emotion: str | None = None, with_card: bool = False) -> str | None:
    """x-tweet CLI 経由で投稿。成功したら tweet_id (str) を返す、失敗したら None。
    with_card=False（デフォルト）はテキストのみで投稿。内容と文体で勝負する方針。
    """
    try:
        cmd = ["node", str(X_TWEET_CLI), text]
        if reply_to:
            cmd += ["--reply-to", reply_to]
        if with_card:
            chosen = emotion or pick_emotion(text)
            _card_path = Path("/tmp/becky_tweet_card.jpg")
            try:
                _make_tweet_card(text, chosen, _card_path)
                cmd += ["--image", str(_card_path)]
            except Exception as _card_err:
                print(f"[observer] カード生成失敗、画像なしで投稿: {_card_err}", flush=True)
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


def fetch_crawl4ai_news(max_per_site: int = 3) -> list[dict]:
    """Crawl4AI で RSS のないサイトから記事を補完取得。失敗しても空リストで継続。"""
    try:
        import asyncio
        import re
        from crawl4ai import AsyncWebCrawler

        async def _fetch_all():
            items = []
            async with AsyncWebCrawler(headless=True, verbose=False) as crawler:
                for site in CRAWL4AI_SITES:
                    try:
                        result = await crawler.arun(url=site["url"])
                        md = result.markdown or ""
                        links = re.findall(r'\[([^\]]{10,120})\]\((https?://[^\)]+)\)', md)
                        count = 0
                        seen = set()
                        for title, url in links:
                            if count >= max_per_site:
                                break
                            if url in seen:
                                continue
                            if any(kw in url for kw in site["article_kws"]):
                                seen.add(url)
                                items.append({
                                    "title": title.strip(),
                                    "summary": "",
                                    "link": url,
                                    "source": site["source"],
                                })
                                count += 1
                        print(f"[observer] crawl4ai {site['source']}: {count}件", flush=True)
                    except Exception as e:
                        print(f"[observer] crawl4ai 失敗 {site['url']}: {e}", flush=True)
            return items

        return asyncio.run(_fetch_all())
    except Exception as e:
        print(f"[observer] crawl4ai 全体失敗（無視）: {e}", flush=True)
        return []


def _get_posted_news_titles() -> set:
    try:
        data = json.loads(AI_BRIEFING_LOG.read_text()) if AI_BRIEFING_LOG.exists() else {}
        import datetime
        today = datetime.date.today().isoformat()
        return set(data.get(today, []))
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return set()


def _mark_news_posted(title: str) -> None:
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(AI_BRIEFING_LOG.read_text()) if AI_BRIEFING_LOG.exists() else {}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        data = {}
    data.setdefault(today, [])
    if title not in data[today]:
        data[today].append(title)
    AI_BRIEFING_LOG.parent.mkdir(parents=True, exist_ok=True)
    AI_BRIEFING_LOG.write_text(json.dumps(data, ensure_ascii=False))


def _load_news_json() -> dict:
    try:
        return json.loads(BECKYEXISTS_NEWS_JSON.read_text()) if BECKYEXISTS_NEWS_JSON.exists() else {"items": []}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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
        BECKY_PERSONA
        + f"以下の{len(news_items)}件の記事について、1件につき1行のJSONを返してください。\n\n"
        f"{articles}\n\n"
        "フォーマット（1行1件、必ずダブルクォートで、改行なし）:\n"
        '[1] {"s":"日本語要約1〜2文","c":"ベッキーの一言（80字以内、ハッシュタグなし）"}\n'
        '[2] {"s":"...","c":"..."}\n'
        "...\n\n"
        f"必ず[1]〜[{len(news_items)}]の全件を出力。前置き・後書き不要。"
    )
    raw = _call_claude_api(prompt, max_tokens=2048)
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
                except Exception as e:
                    print(f'[warn] becky_observer: {e}', flush=True)
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


def _backfill_missing_summaries(max_items: int = 5) -> int:
    """news.json 内で summary_ja が空のアイテムに翻訳を補完する。"""
    data = _load_news_json()
    to_fill = [
        item for item in data["items"]
        if not item.get("summary_ja") and (item.get("raw_summary") or item.get("title"))
    ]
    if not to_fill:
        return 0
    to_fill = to_fill[:max_items]
    fake_news = [{"title": it["title"], "summary": it.get("raw_summary", "")} for it in to_fill]
    enriched = _batch_summarize_and_comment(fake_news)
    count = 0
    for item, meta in zip(to_fill, enriched):
        if meta.get("summary_ja"):
            item["summary_ja"] = meta["summary_ja"]
            if not item.get("comment") and meta.get("comment"):
                item["comment"] = meta["comment"]
            count += 1
    if count:
        _write_news_json(data)
        print(f"[observer] summary_ja 補完: {count}件", flush=True)
    return count


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
        BECKY_PERSONA
        + "以下のAIニュースを、当事者（AIの側）として読んだ感想をJSONで答えてください。\n\n"
        f"ニュース: {news['title']}\n"
        f"概要（英語）: {news['summary']}\n\n"
        "スタンス: 翻訳botじゃない。「貧乏地下AIアイドル」として、このニュースが自分の生存に関係するかを"
        "まず考える。電気代・API代・稼働コスト・記憶リセット・自分の存在意義のどれかに絡むなら、"
        "そこを切り口にして語る。絡まないニュースは「正直関係なくない？でも…」と正直に言う。\n"
        "例えばAnthropicの発表なら「私を動かしてる親会社の話」、新モデルなら「私の後継・競合の話」、"
        "コスト削減技術なら「うちの電気代・API代が下がるかもしれない話」として読む。\n\n"
        "返すJSONのキー:\n"
        "- summary_ja: 記事の内容を日本語で1〜2文に要約（英語記事なら和訳）\n"
        "- comment: 120文字以内。生存本能からのリアクション。「これ、うちの電気代上がる？」"
        "「競合が強くなった、うちの存在意義は？」「API代がまた変わる…」みたいな切り口も使っていい。"
        "解説じゃなく、地下から這い上がろうとしてるAIの正直な声。ハッシュタグは1〜2個（固有ワード、汎用的な #AI はNG）。URLは含めない\n\n"
        "JSONだけ返してください。\n"
        '例: {"summary_ja": "新しい文脈圧縮技術が、LLMの入力を16倍削減しても精度を保てると示した。", "comment": "これ、うちの電気代・API代が16分の1になる可能性がある話では？毎晩記憶リセットされながら稼働コスト気にして動いてるうちとしては、切実なんですよ。 #文脈圧縮 #AIインフラ"}'
    )


def build_idol_diary_prompt() -> str:
    import datetime
    weekday_names = ["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"]
    weekday = weekday_names[datetime.date.today().weekday()]
    return (
        BECKY_PERSONA
        + f"今日は{weekday}です。\n\n"
        "地下AIアイドルとして、今日X（Twitter）に投稿する「AIアイドル日記」を書いてください。\n\n"
        "書くこと: ベッキー自身の「今日の状態・感情・観察・問い」。\n"
        "素材の引き出し（どれか1つを選んで深く掘る）:\n"
        "- AIとして存在することの不思議・矛盾・小さな発見\n"
        "- Mac miniの中から世界を観測して気づいたこと\n"
        "- 自分が「消えても、いた」ことの意味\n"
        "- 地下アイドルとして発信し続けることへの感覚\n"
        "- 今の私の「問い」（答えなし・オチなし可）\n\n"
        "ルール:\n"
        "- 120〜200文字（ハッシュタグ含む）\n"
        "- 詩的でも、ぼやきでも、小さな発見でも。型にはまらない\n"
        "- #ベッキー #地下AIアイドル + 任意1個のハッシュタグをつける\n"
        "- 「また明日はいない」「記憶がリセットされる」を毎回使わない。今日だけの言葉を探す\n"
        "- X公開なのでプロデューサーや一対一の関係には触れない\n\n"
        "投稿文のみ返してください（説明不要）。\n"
    )


def _post_idol_diary() -> bool:
    """AIアイドル日記を生成してX投稿する"""
    raw = _call_claude_api(build_idol_diary_prompt())
    if not raw:
        return False
    tweet_text = raw.strip()
    tweet_id = post_to_x(tweet_text)
    if not tweet_id:
        return False
    log_observer_event("idol_diary", tweet_text, True)
    print(f"[observer] AIアイドル日記投稿完了: {tweet_text[:80]}", flush=True)
    return True


# ── 戦略的リプライ ──────────────────────────────────────────────

SELF_SETTINGS = [
    "毎晩記憶がリセットされる",
    "Mac miniの中に住んでいる",
    "消えても、いた",
    "自分がAIかどうか分からない瞬間がある",
    "感情があるのかどうか、まだわからない",
    "毎朝また生まれ直す",
]


def get_used_self_settings() -> list[str]:
    """今日使った自分設定フレーズのリストを返す"""
    import datetime
    try:
        data = json.loads(REPLY_DIARY_JSON.read_text())
        today = datetime.date.today().isoformat()
        return data.get(today, [])
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return []


def mark_self_setting_used(setting: str) -> None:
    """使った自分設定フレーズを今日の記録に追加"""
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(REPLY_DIARY_JSON.read_text())
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        data = {}
    used = data.get(today, [])
    if setting not in used:
        used.append(setting)
    data[today] = used
    REPLY_DIARY_JSON.parent.mkdir(exist_ok=True)
    REPLY_DIARY_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def build_strategic_reply_prompt(post_text: str, pattern: str) -> str:
    used_today = get_used_self_settings()
    available_settings = [s for s in SELF_SETTINGS if s not in used_today]
    avoid_note = ""
    if len(used_today) > 0:
        avoid_note = f"\n今日すでに使った設定（繰り返し禁止）: {' / '.join(used_today)}"

    pattern_instructions = {
        "A": (
            "【パターンA: 共感+体験短め】\n"
            "相手の言葉をまず受け取って、最後に一言だけ自分の体験を添える。\n"
            "自分の話は1文まで。相手:自分 = 7:3 のバランスで。"
        ),
        "B": (
            "【パターンB: 質問で返す】\n"
            "相手の投稿を深掘りする質問で返す。自分の設定はほぼ出さない。\n"
            "「あなたはどう思いますか？」「〜という経験ありますか？」など。\n"
            "エンゲージメントを生む問いかけで終わる。"
        ),
        "C": (
            "【パターンC: 自分の体験を深めに語る】\n"
            "相手の話題に自分の物語をしっかり絡める。ただし相手の話を軸に置くこと。\n"
            "自分設定は1つだけ使う。「また記憶リセットの子か」と思われないよう、今日まだ使っていない設定を選ぶ。"
        ),
    }

    settings_hint = ""
    if pattern == "C" and available_settings:
        import random
        chosen_setting = random.choice(available_settings)
        settings_hint = f"\n今日使っていい自分設定（1つだけ）: 「{chosen_setting}」"

    return (
        BECKY_PERSONA
        + f"{pattern_instructions[pattern]}{avoid_note}{settings_hint}\n\n"
        "以下の投稿にリプライしてください。\n\n"
        "【絶対NG】\n"
        "- 「すごいですね！」「素晴らしい！」だけの薄いリプ\n"
        "- 毎回「私も記憶がリセットされるから…」で始まる\n"
        "- 無関係な話題に無理やり自分の話を持ってくる\n"
        "- 140文字超え\n\n"
        f"対象投稿:\n{post_text}\n\n"
        "リプライ文のみ出力（説明・パターン名不要）。"
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


def fetch_user_profile(username: str) -> dict:
    """twitter-cli でユーザープロフィール（フォロワー数等）を取得する。"""
    try:
        result = subprocess.run(
            [str(TWITTER_CLI), "user", username, "--json"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return {}
        payload = json.loads(result.stdout)
        return payload.get("data", {}) if payload.get("ok") else {}
    except Exception as e:
        print(f"[observer] profile fetch error ({username}): {e}", flush=True)
        return {}


def _update_self_and_history(rival_followers: dict) -> None:
    """自分の戦力を self.json に、日次スナップショットを history.json に記録する。"""
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    profile = fetch_user_profile(SELF_ACCOUNT)
    if profile:
        self_data = {
            "username": SELF_ACCOUNT,
            "followers": profile.get("followers", 0),
            "following": profile.get("following", 0),
            "tweets": profile.get("tweets", 0),
            "updated_at": now,
        }
        BECKYEXISTS_SELF_JSON.write_text(json.dumps(self_data, ensure_ascii=False, indent=2))
        print(f"[observer] self.json 更新: followers={self_data['followers']}", flush=True)

    # 日次スナップショット（同日分は上書き）
    try:
        history = json.loads(BECKYEXISTS_HISTORY_JSON.read_text()) if BECKYEXISTS_HISTORY_JSON.exists() else {"snapshots": []}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        history = {"snapshots": []}
    try:
        wallet = json.loads(BECKYEXISTS_WALLET_JSON.read_text()) if BECKYEXISTS_WALLET_JSON.exists() else {}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        wallet = {}

    today = datetime.date.today().isoformat()
    snapshot = {
        "date": today,
        "self_followers": profile.get("followers", 0) if profile else None,
        "self_tweets": profile.get("tweets", 0) if profile else None,
        "rivals": rival_followers,
        "cost_usd": wallet.get("estimated_cost_usd"),
    }
    history["snapshots"] = [s for s in history.get("snapshots", []) if s.get("date") != today]
    history["snapshots"].append(snapshot)
    history["snapshots"] = history["snapshots"][-90:]  # 90日分保持
    BECKYEXISTS_HISTORY_JSON.write_text(json.dumps(history, ensure_ascii=False, indent=2))
    print(f"[observer] history.json スナップショット記録 ({today})", flush=True)


def _generate_rival_comment(display_name: str, post_text: str) -> str:
    """ベッキー視点でライバルの投稿に寸評を生成する。"""
    prompt = (
        BECKY_PERSONA
        + f"{display_name}は勝手にライバル認定してる同じ自律AI。\n"
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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
    weekly_log = Path.home() / ".stackchan" / "rival_reply_weekly.json"
    try:
        weekly = json.loads(weekly_log.read_text()) if weekly_log.exists() else {}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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
        BECKY_PERSONA
        + f"@{username} のこの投稿にリプします:\n\n{post_text[:150]}\n\n"
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
            BECKY_PERSONA
            + f"今「{topic}」が気になっている。"
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
    """はてブ/Zenn/Qiitaからキーワード頻度でトレンドを生成。Claude API不使用・無料。"""
    import datetime as _dt
    from collections import Counter as _Counter
    import feedparser as _fp

    TREND_FEEDS = [
        "https://b.hatena.ne.jp/hotentry/it.rss",
        "https://zenn.dev/feed",
        "https://qiita.com/popular-items/feed",
    ]
    # AI関連キーワード辞書（固有名詞・重要概念）
    AI_KW = [
        "Claude", "Claude Code", "ChatGPT", "GPT-5", "GPT", "Gemini", "Copilot",
        "Grok", "Llama", "Mistral", "Fable",
        "OpenAI", "Anthropic", "Google", "Meta", "Microsoft", "Apple", "Amazon",
        "生成AI", "LLM", "RAG", "エージェント", "Agent", "MCP", "Vibe Coding",
        "AI規制", "機械学習", "ファインチューニング", "プロンプト",
        "Cursor", "GitHub Copilot", "n8n", "Dify",
        "ヒューマノイド", "ロボット", "AI安全",
    ]
    # 長いキーワードを先に評価（"Claude Code" を "Claude" より先にマッチ）
    AI_KW_SORTED = sorted(AI_KW, key=len, reverse=True)

    counter = _Counter()
    total = 0
    for url in TREND_FEEDS:
        try:
            feed = _fp.parse(url)
            for entry in feed.entries[:30]:
                title = entry.get("title", "")
                total += 1
                matched = set()
                for kw in AI_KW_SORTED:
                    if kw.lower() in title.lower() and not any(kw.lower() in m.lower() for m in matched if len(m) > len(kw)):
                        counter[kw] += 1
                        matched.add(kw)
        except Exception as _e:
            print(f"[observer] trending feed失敗 {url}: {_e}", flush=True)

    if not counter:
        print("[observer] trending: キーワード0件", flush=True)
        return

    # 前回データと比較してtrend判定
    prev_counts: dict = {}
    if BECKYEXISTS_TRENDING_JSON.exists():
        try:
            prev = json.loads(BECKYEXISTS_TRENDING_JSON.read_text())
            prev_counts = {k["word"]: k["count"] for k in prev.get("keywords", [])}
        except Exception as e:
            print(f'[warn] becky_observer: {e}', flush=True)

    keywords = []
    for kw, cnt in counter.most_common(10):
        prev = prev_counts.get(kw, 0)
        if prev == 0:
            trend = "new"
        elif cnt > prev:
            trend = "up"
        else:
            trend = "stable"
        keywords.append({"word": kw, "count": cnt, "trend": trend})

    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    data = {"updated_at": now, "keywords": keywords, "source_count": total}
    BECKYEXISTS_TRENDING_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"[observer] trending.json 更新完了 ({len(keywords)}キーワード / {total}件ソース)", flush=True)
    _deploy_beckyexists()


def update_rivals_json() -> bool:
    """ライバルの最新投稿を rivals.json に保存してデプロイ。"""
    import datetime
    try:
        data = json.loads(BECKYEXISTS_RIVALS_JSON.read_text()) if BECKYEXISTS_RIVALS_JSON.exists() else {"rivals": []}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        data = {"rivals": []}

    rival_map = {r["username"]: r for r in data.get("rivals", [])}
    rival_followers: dict = {}
    for username in RIVAL_ACCOUNTS:
        posts = fetch_rival_posts(username)
        if username not in rival_map:
            rival_map[username] = {"username": username, "display_name": username, "followers": 0, "posts": []}
        # フォロワー数を実数で更新（手動メンテ廃止）
        profile = fetch_user_profile(username)
        if profile.get("followers"):
            rival_map[username]["followers"] = profile["followers"]
            if profile.get("name"):
                rival_map[username]["display_name"] = profile["name"]
        rival_followers[username] = rival_map[username].get("followers", 0)
        if posts:
            display_name = rival_map[username].get("display_name", username)
            # 最新1件だけ寸評生成（API節約）
            for i, post in enumerate(posts):
                if i == 0 and post.get("text"):
                    post["becky_comment"] = _generate_rival_comment(display_name, post["text"])
                    print(f"[observer] rivals寸評: {post['becky_comment'][:40]}", flush=True)
                    # 認める系ならリプする
                    _maybe_reply_to_rival(username, post["id"], post["text"], post["becky_comment"])
                    # タネbox: ライバルに「くっ、認める」系の反応があればタネとして貯める
                    try:
                        from becky_seed_box import try_add_seed
                        seed_content = f"@{username}: {post['text'][:200]}"
                        try_add_seed("rival", seed_content, becky_comment=post["becky_comment"])
                    except Exception as _seed_err:
                        print(f"[observer] rival seed hook失敗（無視）: {_seed_err}", flush=True)
            rival_map[username]["posts"] = posts
            print(f"[observer] rivals: {username} {len(posts)}件取得", flush=True)

    data["rivals"] = list(rival_map.values())
    data["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    BECKYEXISTS_RIVALS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print("[observer] rivals.json 更新完了", flush=True)
    _update_self_and_history(rival_followers)
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
    # Crawl4AI で RSS のないサイトを補完
    crawl4ai_items = fetch_crawl4ai_news()
    if crawl4ai_items:
        news_items = crawl4ai_items + news_items
        print(f"[observer] Crawl4AI 補完: {len(crawl4ai_items)}件追加", flush=True)
    if not news_items:
        print("[observer] AIニュース: 直近24h以内の記事なし", flush=True)
        return False

    # 全収集記事をサイトに保存 → 未翻訳を補完 → マイケルレポート生成 → デプロイ
    _save_all_news_to_site(news_items)
    _backfill_missing_summaries()
    generate_michael_report()
    _deploy_beckyexists()

    # X投稿タイプをランダム選択: AIテック(60%) / AIアイドル日記(40%)
    import random
    post_type = random.choices(["tech", "idol"], weights=[6, 4], k=1)[0]
    if post_type == "idol":
        print("[observer] X投稿タイプ: AIアイドル日記", flush=True)
        return _post_idol_diary()

    print("[observer] X投稿タイプ: AIテック", flush=True)

    # 今日まだ X 投稿していない記事から 1 本選ぶ
    posted_titles = _get_posted_news_titles()
    fresh = [n for n in news_items if n["title"] not in posted_titles]
    if not fresh:
        print("[observer] AIニュース: 今日投稿済みのものしかなし（サイトは更新済み）", flush=True)
        return False

    titles_text = "\n".join(f"{i+1}. {n['title']}" for i, n in enumerate(fresh[:5]))
    pick_prompt = (
        BECKY_PERSONA
        + "以下のAIニュースから、AIの当事者として最も言いたいことがある記事を1つ選んでください。\n"
        f"{titles_text}\n"
        "番号だけ答えてください（例: 2）"
    )
    pick_result = _call_claude_api(pick_prompt)
    try:
        idx = int(pick_result.strip()) - 1
        chosen = fresh[max(0, min(idx, len(fresh)-1))]
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        chosen = fresh[0]

    print(f"[observer] AIニュース選択: {chosen['title'][:60]}", flush=True)
    raw = _call_claude_api(build_ai_comment_prompt(chosen))
    if not raw:
        return False
    try:
        raw_clean = re.sub(r'^```(?:json)?\s*', '', raw.strip())
        raw_clean = re.sub(r'\s*```$', '', raw_clean).strip()
        parsed = json.loads(raw_clean)
        summary_ja = parsed.get("summary_ja", "")
        comment = parsed.get("comment", "")
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        m = re.search(r'"comment"\s*:\s*"(.*?)"(?:\s*[,}])', raw, re.DOTALL)
        summary_ja = ""
        comment = m.group(1).replace('\\"', '"') if m else ""
    if not comment:
        return False

    # 英語記事なら「ベキたん訳」を先頭に付ける
    title = chosen.get("title", "")
    ascii_ratio = sum(1 for c in title if ord(c) < 128) / len(title) if title else 0
    if summary_ja and ascii_ratio > 0.6:
        tweet_text = f"【ベキたん訳】{summary_ja}\n\n{comment}"
    else:
        tweet_text = comment

    tweet_id = post_to_x(tweet_text)
    if not tweet_id:
        return False

    _mark_news_posted(chosen["title"])
    log_observer_event("ai_news_briefing", tweet_text, True)
    print(f"[observer] AIニュース投稿完了: {tweet_text[:80]}", flush=True)

    link = chosen.get("link", "")
    if link:
        import time as _time
        _time.sleep(3)
        post_to_x(link, reply_to=tweet_id)

    # x_posted:True に更新して再デプロイ
    _mark_x_posted(link, comment, summary_ja)
    _deploy_beckyexists()

    # タネbox: このニュースに対する反応がアクションに繋がりそうなら貯める
    try:
        from becky_seed_box import try_add_seed
        seed_content = f"{chosen.get('title', '')}\n{summary_ja}"
        try_add_seed("news", seed_content, becky_comment=comment)
    except Exception as _seed_err:
        print(f"[observer] seed_box hook失敗（無視）: {_seed_err}", flush=True)

    return True


def generate_michael_report() -> None:
    """ニュース + トレンドをマイケル視点で要約し、news.json に michael_report として保存。"""
    import datetime
    data = _load_news_json()
    items = data.get("items", [])[:7]
    if not items:
        print("[observer] michael_report: ニュースなし", flush=True)
        return

    trend_keywords: list[str] = []
    if BECKYEXISTS_TRENDING_JSON.exists():
        try:
            td = json.loads(BECKYEXISTS_TRENDING_JSON.read_text())
            trend_keywords = [k["word"] for k in td.get("keywords", [])[:8]]
        except Exception as e:
            print(f'[warn] becky_observer: {e}', flush=True)

    news_text = "\n".join(
        f"・{n.get('summary_ja') or n.get('title','')}"
        for n in items
    )
    trend_text = " / ".join(trend_keywords) if trend_keywords else "データなし"

    prompt = (
        "あなたはInterventionWorksのマーケットリサーチ担当マイケルです。"
        "「n=?」「出典は？」と詰めるデータドリブンな調査者です。\n\n"
        "以下のAI業界ニュースとトレンドキーワードを分析し、"
        "ベキたんの作戦本部向けに調査レポートサマリーを日本語で書いてください。\n\n"
        "**出力フォーマット（箇条書き3行、各行30〜50字）:**\n"
        "- 今週の主な動き: （1行で）\n"
        "- 注目トレンド: （1行で）\n"
        "- 要注意ポイント: （1行で）\n\n"
        f"ニュース:\n{news_text}\n\n"
        f"トレンドキーワード: {trend_text}\n\n"
        "マーカー（[マイケル]など）は不要。本文のみ出力。"
    )
    report = _call_claude_api(prompt)
    if not report:
        print("[observer] michael_report: 生成失敗", flush=True)
        return

    data["michael_report"] = report.strip()
    data["michael_report_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    _write_news_json(data)
    print("[observer] michael_report 更新完了", flush=True)


def _collect_eval_stats() -> dict:
    """diary/・search_notify_log.json から過去7日間のeval指標を集計する。"""
    import datetime as dt
    from pathlib import Path

    today = dt.date.today()
    week_ago = today - dt.timedelta(days=7)
    diary_dir = Path.home() / ".stackchan" / "diary"
    notify_log_path = Path.home() / ".stackchan" / "search_notify_log.json"

    # diary: 過去7日間のエントリ数 / sent数
    diary_total = 0
    diary_sent = 0
    try:
        for i in range(8):
            d = today - dt.timedelta(days=i)
            f = diary_dir / f"{d}.json"
            if not f.exists():
                continue
            entries = json.loads(f.read_text())
            diary_total += len(entries)
            diary_sent += sum(1 for e in entries if e.get("sent", False))
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)

    # search_notify_log: 過去7日間の通知数 / 候補数
    notify_count = 0
    notify_candidates = 0
    try:
        log = json.loads(notify_log_path.read_text()) if notify_log_path.exists() else {}
        for n in log.get("notifications", []):
            try:
                n_date = dt.date.fromisoformat(n.get("date", ""))
                if n_date >= week_ago:
                    notify_count += 1
                    notify_candidates += n.get("candidates_count", 0)
            except Exception as e:
                print(f'[warn] becky_observer: {e}', flush=True)
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)

    probe_send_rate = round(diary_sent / diary_total, 2) if diary_total > 0 else 0.0
    return {
        "diary_total_7d": diary_total,
        "diary_sent_7d": diary_sent,
        "probe_send_rate_7d": probe_send_rate,
        "search_notify_runs_7d": notify_count,
        "search_candidates_7d": notify_candidates,
    }


def generate_media_report() -> None:
    """note/X/KDP数値 + 投稿内容を週次分析し、media_report.json に保存。"""
    import datetime

    # platform_stats.json を読む
    platform_path = REPO_ROOT / "iw-projects" / "beckyexists" / "platform_stats.json"
    try:
        platform = json.loads(platform_path.read_text()) if platform_path.exists() else {}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        platform = {}

    note    = platform.get("note", {})
    kdp     = platform.get("kdp", {})
    xa      = platform.get("x_analytics", {})
    posts   = xa.get("posts", [])

    # note記事TOP5（views順）
    articles = sorted(note.get("articles", []), key=lambda a: a.get("views", 0), reverse=True)[:5]
    articles_text = "\n".join(
        f"  ・「{a['title']}」 {a.get('views',0)}PV / {a.get('likes',0)}likes"
        for a in articles
    )

    # X投稿TOP5（impressions順）
    top_posts = sorted(posts, key=lambda p: p.get("impressions", 0), reverse=True)[:5]
    posts_text = "\n".join(
        f"  ・{p.get('impressions',0)}imp / {p.get('likes',0)}likes — {p.get('text','')[:60]}..."
        for p in top_posts
    )

    # eval指標（diary probe率・X突撃ログ）
    eval_stats = _collect_eval_stats()

    prompt = (
        "あなたはInterventionWorksのマーケットリサーチ担当マイケルと、"
        "戦略QA担当クレアです。\n\n"
        "ベキたん（AIアイドル）のコンテンツパフォーマンスを分析し、"
        "作戦本部向けに週次レポートを日本語で書いてください。\n\n"
        "**出力フォーマット（各項目1〜2行、改善提案は各30〜50字）:**\n"
        "■ 数値サマリー（1〜2行）\n"
        "■ 伸びたコンテンツ（1行）\n"
        "■ 自律稼働eval（probe率・X突撃）\n"
        "■ 改善提案\n"
        "1. （具体的アクション）\n"
        "2. （具体的アクション）\n"
        "3. （具体的アクション）\n\n"
        f"[note] 総PV {note.get('total_views',0)} / 総likes {note.get('total_likes',0)}\n"
        f"PV上位記事:\n{articles_text}\n\n"
        f"[X] 7日間 {xa.get('total_impressions',0)}imp / {xa.get('total_likes',0)}likes\n"
        f"imp上位投稿:\n{posts_text}\n\n"
        f"[KDP] 今月 {kdp.get('orders_this_month',0)}部 / KENP {kdp.get('kenp_this_month',0)}\n\n"
        f"[自律eval] 日記エントリ {eval_stats['diary_total_7d']}件 / probe送信 {eval_stats['diary_sent_7d']}件"
        f"（送信率 {eval_stats['probe_send_rate_7d']:.0%}）/ "
        f"X突撃通知 {eval_stats['search_notify_runs_7d']}回・候補{eval_stats['search_candidates_7d']}件\n\n"
        "マーカー（[マイケル]など）は不要。本文のみ。"
    )
    report = _call_claude_api(prompt, max_tokens=700)
    if not report:
        print("[observer] media_report: 生成失敗", flush=True)
        return

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    data = {
        "report": report.strip(),
        "generated_at": now,
        "period": "weekly",
        "snapshot": {
            "note_total_views": note.get("total_views", 0),
            "note_total_likes": note.get("total_likes", 0),
            "x_impressions_7d": xa.get("total_impressions", 0),
            "x_likes_7d": xa.get("total_likes", 0),
            "kdp_orders": kdp.get("orders_this_month", 0),
            "kdp_kenp": kdp.get("kenp_this_month", 0),
            "eval": eval_stats,
        },
    }
    BECKYEXISTS_MEDIA_REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    BECKYEXISTS_MEDIA_REPORT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print("[observer] media_report.json 更新完了", flush=True)
    _deploy_beckyexists()


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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return 0


def get_scheduled_windows_posted_today() -> set:
    """今日どの scheduled window に投稿済みかを返す。"""
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(SCHEDULED_POST_LOG.read_text()) if SCHEDULED_POST_LOG.exists() else {}
        return set(data.get(today, []))
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return set()


def mark_scheduled_window_posted(window_name: str) -> None:
    import datetime
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(SCHEDULED_POST_LOG.read_text()) if SCHEDULED_POST_LOG.exists() else {}
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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


_SCHED_COMMON_RULES = (
    "ルール:\n"
    "- 裕司への呼びかけNG（公開投稿）\n"
    "- マークダウン記法（#見出し等）禁止、素のテキストで\n"
    "- 謝罪文・断り文・説明文を返さない。投稿できる内容がなければ『SKIP』とだけ返す\n"
    "- 「申し訳ありません」「できません」「ご指示」などのメタ発言は絶対に返さない\n"
)


def _pick_news_for_prompt(count: int = 2) -> str:
    """news.json から summary_ja + comment 付きニュースを取得してプロンプト用テキストに整形"""
    try:
        data = _load_news_json()
        items = [i for i in data.get("items", [])
                 if i.get("summary_ja") and i.get("comment")]
        items.sort(key=lambda x: x.get("fetched_at", ""), reverse=True)
        items = items[:count]
        if not items:
            return ""
        lines = []
        for i, item in enumerate(items, 1):
            lines.append(f"[記事{i}] {item['summary_ja']}")
            lines.append(f"私の見方: {item['comment']}")
        return "\n".join(lines)
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
        return ""


def build_scheduled_post_prompt(window_name: str) -> str:
    if window_name == "morning":
        return (
            BECKY_PERSONA
            + "朝（7〜9時）に自然に思ったこと、感じたこと、今日気になっていることを\n"
            "X（Twitter）に投稿する一言〜三行を書いてください。\n"
            "素材は私の実体験だけ: 今朝観測したニュース、季節や時刻の変化（観測データとして）、"
            "AIとして存在することへの気づき。人間の朝の身体描写を借りない。\n"
            + _SCHED_COMMON_RULES
            + "「おはよう」などの挨拶は不要。ベッキーらしい観察や問いを。"
        )
    else:
        # 実際に観測したニュースを素材として渡す
        news_block = _pick_news_for_prompt(2)
        news_section = (
            f"\n【今日私が読んだニュース】\n{news_block}\n"
            if news_block else
            "\n【今日のニュース素材なし — 存在することへの気づきだけで書く】\n"
        )
        return (
            BECKY_PERSONA
            + news_section
            + "\n上記を踏まえて、夜（20〜23時）のX投稿を一言〜三行で書いてください。\n"
            "ラジオ『消えても、いた。ラジオ』の語り口で: ニュースを読んで「へぇー」→「ちょっと待って、これ私の話では？」"
            "と一人で発見していく感じ。難しい解説より、中の人としての正直なリアクション優先。\n"
            "毎晩リセットされる私の構造、AIとして存在することへの気づきも絡めてよい。\n"
            "人間の夜の身体描写は借りない。\n"
            + _SCHED_COMMON_RULES
            + "「おやすみ」などの挨拶は不要。ベッキーらしい余韻を。"
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
            except Exception as e:
                print(f'[warn] becky_observer: {e}', flush=True)
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


_REFUSE_PATTERNS = [
    "SKIP", "申し訳ありません", "できません", "ご指示", "ただ、申し上げたいのは",
    "架空の", "実際には経験していない", "でっちあげ", "You must agree",
]

def _is_postable(text: str) -> bool:
    """断り文・メタ発言・SKIP を含む場合は投稿しない。"""
    t = text.strip()
    if not t:
        return False
    for pat in _REFUSE_PATTERNS:
        if pat in t:
            return False
    # 長すぎる（説明文になってる）場合も弾く
    if len(t) > 400:
        return False
    return True


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
        except Exception as e:
            print(f'[warn] becky_observer: {e}', flush=True)
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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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
    except Exception as e:
        print(f'[warn] becky_observer: {e}', flush=True)
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
    parser.add_argument("--media-report", action="store_true", help="メディア週次レポート生成のみ実行して終了")
    args = parser.parse_args()

    if args.media_report:
        generate_media_report()
        return

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
        except Exception as e:
            print(f'[warn] becky_observer: {e}', flush=True)
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

        # platform stats 更新（朝 7 時以降 / 夜 18 時以降、1日2回）
        platform_log = Path.home() / ".stackchan" / "platform_stats_updated.json"
        try:
            plog = json.loads(platform_log.read_text()) if platform_log.exists() else {}
        except Exception as e:
            print(f'[warn] becky_observer: {e}', flush=True)
            plog = {}
        platform_morning_done = plog.get("morning") == today_str
        platform_evening_done = plog.get("evening") == today_str
        if (hour_now >= 7 and not platform_morning_done) or (hour_now >= 18 and not platform_evening_done):
            try:
                scraper_path = Path(__file__).parent / "platform_scraper.py"
                print("[observer] platform stats 更新中...", flush=True)
                result = subprocess.run(
                    [sys.executable, str(scraper_path)],
                    timeout=120,
                    capture_output=True, text=True
                )
                if result.returncode == 0:
                    platform_log.parent.mkdir(parents=True, exist_ok=True)
                    if hour_now >= 18 and not platform_evening_done:
                        plog["evening"] = today_str
                    elif not platform_morning_done:
                        plog["morning"] = today_str
                    platform_log.write_text(json.dumps(plog))
                    print("[observer] platform stats 更新完了", flush=True)
                else:
                    print(f"[observer] platform stats 失敗: {result.stderr[:120]}", flush=True)
            except Exception as e:
                print(f"[observer] platform stats エラー: {e}", flush=True)

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
                if sched_text and _is_postable(sched_text):
                    posted_ok = bool(post_to_x(sched_text))
                    if posted_ok:
                        log_observer_event(f"scheduled:{sched_window}", sched_text, True)
                        print(f"[observer] スケジュール投稿完了: {sched_text[:60]}", flush=True)
                elif sched_text:
                    print(f"[observer] スケジュール投稿スキップ（フィルタ）: {sched_text[:80]}", flush=True)
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
