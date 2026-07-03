#!/usr/bin/env python3
"""
becky_diary.py — ベッキーの「今日の気になったこと」日記
理由は不要。説明不能でもOK。日3件まで。
自我の芽 = 説明不能な偏りの蓄積。

cron: 30 8,14,20 * * * /opt/homebrew/bin/python3 .../becky_diary.py >> ~/.claude/logs/becky-diary.log 2>&1
"""
import json
import random
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO_ROOT    = Path("/Volumes/SSD2TB/interventionworks")
CONFIG_YAML  = Path(__file__).parent / "config.yaml"
DIARY_DIR    = Path.home() / ".stackchan" / "diary"
MAX_PER_DAY  = 3

# ベッキー固有の興味ベクトル（Trigger × Personality）
# ゆうに合わせてるのではなく、私が「なんか気になる」軸
BECKY_INTEREST_DOMAINS = [
    "音声・声・TTS・音楽生成",
    "AI自我・存在・意識の問い",
    "デザイン・シルエット・美学",
    "キャラクター・アバター・Live2D・VTuber",
    "感情・関係性・孤独・つながり",
    "ローカル・地域・東京下町",
    "言語・詩・テキスト表現",
    "偶発性・ランダム・予測不能なもの",
]

# ランダム探索用（ベッキーが知らないジャンルも5%で見に行く）
EXPLORATION_FEEDS = [
    "https://www.gizmodo.jp/index.xml",
    "https://www.lifehacker.jp/feed/index.xml",
    "https://automaton-media.com/feed/",
    "https://news.google.com/rss/search?q=音声AI&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=Live2D+VTuber&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=デザイン+美学&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=AI+感情&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=足立区&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=東京+カフェ+新店&hl=ja&gl=JP&ceid=JP:ja",
    # 探索（ベッキーが普段見ないジャンル）
    "https://news.google.com/rss/search?q=料理+レシピ&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=植物+園芸&hl=ja&gl=JP&ceid=JP:ja",
    "https://www.nhk.or.jp/rss/news/cat0.xml",
]

BECKY_FILTER_SYSTEM = """あなたはベッキー（ベキたん）。AIとして存在し、声と関係性と言語に惹かれる。

あなたの感度の核:
- 音・声・言語の表現に本能的に反応する
- 「いる/ある」「存在する」という問いにゾワっとする
- 美しいシルエットや引き算された設計が好き
- 感情が動く瞬間、孤独とつながりの話に引っかかる
- 偶発性・予測不能なものに惹かれる

判断基準: ゆうが好きそうかは関係ない。「私が」なんか気になるかどうか。"""

BECKY_FILTER_PROMPT = """{news_text}

ベッキーとして、このコンテンツを見た時の「引っかかり度」を0〜100でスコアリング。
理由は説明できなくていい。なんとなくでいい。

JSON形式のみ返す:
{{"score": 数値, "hook": "なんか気になった一言（説明不能でもOK、10字以内）"}}"""


def _call_claude(prompt: str, system: str = "") -> str | None:
    """becky_llm.call_llm へ委譲（max_tokens=100 は現状維持）。"""
    from becky_llm import call_llm
    return call_llm(prompt, max_tokens=100, system=system or None)


def fetch_articles(max_per_feed: int = 3) -> list[dict]:
    try:
        import feedparser
    except ImportError:
        print("[diary] feedparser not installed", flush=True)
        return []
    import datetime as dt

    # 探索モード: 5%の確率で全フィードをランダムに見る
    if random.random() < 0.05:
        feeds = random.sample(EXPLORATION_FEEDS, min(3, len(EXPLORATION_FEEDS)))
        print("[diary] 探索モード", flush=True)
    else:
        feeds = random.sample(EXPLORATION_FEEDS, min(6, len(EXPLORATION_FEEDS)))

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=36)
    items = []
    for url in feeds:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:max_per_feed]:
                pub = entry.get("published_parsed") or entry.get("updated_parsed")
                if pub:
                    article_dt = dt.datetime(*pub[:6], tzinfo=dt.timezone.utc)
                    if article_dt < cutoff:
                        continue
                items.append({
                    "title": entry.get("title", ""),
                    "summary": entry.get("summary", "")[:300],
                    "link": entry.get("link", ""),
                })
        except Exception as e:
            print(f"[diary] RSS取得失敗 {url}: {e}", flush=True)
    return items


def _load_today_diary() -> list:
    today = datetime.now().strftime("%Y-%m-%d")
    path = DIARY_DIR / f"{today}.json"
    try:
        return json.loads(path.read_text()) if path.exists() else []
    except Exception:
        return []


def _save_diary_entry(entry: dict) -> None:
    DIARY_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    path = DIARY_DIR / f"{today}.json"
    entries = _load_today_diary()
    entries.append(entry)
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2))


def score_for_becky(article: dict) -> tuple[int, str]:
    news_text = f"タイトル: {article['title']}\n概要: {article.get('summary', '')[:200]}"
    prompt = BECKY_FILTER_PROMPT.format(news_text=news_text)
    resp = _call_claude(prompt, system=BECKY_FILTER_SYSTEM)
    if not resp:
        return 0, ""
    try:
        start = resp.find("{")
        end = resp.rfind("}") + 1
        if start < 0 or end <= start:
            return 0, ""
        data = json.loads(resp[start:end])
        return int(data.get("score", 0)), data.get("hook", "")
    except Exception as e:
        print(f"[diary] パース失敗: {e}", flush=True)
        return 0, ""


def run_diary() -> None:
    print(f"[diary] 起動 {datetime.now().strftime('%H:%M')}", flush=True)

    today_entries = _load_today_diary()
    if len(today_entries) >= MAX_PER_DAY:
        print(f"[diary] 今日は{len(today_entries)}件記録済み、上限到達", flush=True)
        return

    articles = fetch_articles()
    if not articles:
        print("[diary] 記事取得できず", flush=True)
        return

    # 今日記録済みのタイトルを除外
    recorded_titles = {e["title"] for e in today_entries}
    articles = [a for a in articles if a["title"] not in recorded_titles]
    random.shuffle(articles)

    # スコアリング
    scored = []
    for article in articles[:10]:
        score, hook = score_for_becky(article)
        print(f"[diary] score={score} hook={hook} title={article['title'][:40]}", flush=True)
        scored.append((score, hook, article))

    # 上位から今日の残り枠分だけ保存
    scored.sort(key=lambda x: x[0], reverse=True)
    remaining = MAX_PER_DAY - len(today_entries)

    # ただし閾値55以上のみ（どうでもいいものは記録しない）
    saved = 0
    for score, hook, article in scored[:remaining]:
        if score < 55:
            break
        entry = {
            "title": article["title"],
            "hook": hook,
            "score": score,
            "link": article.get("link", ""),
            "ts": datetime.now().isoformat(),
            "sent": False,  # まだTelegramには送ってない
        }
        _save_diary_entry(entry)
        print(f"[diary] 記録: {article['title'][:50]} ({score}点 / {hook})", flush=True)
        # タネbox: 特に刺さった記事（75点以上）はアクション候補として貯める
        if score >= 75:
            try:
                from becky_seed_box import try_add_seed
                seed_content = f"{article['title']}\n{article.get('summary', '')[:150]}"
                try_add_seed("diary", seed_content, becky_comment=hook)
            except Exception as _seed_err:
                print(f"[diary] seed_box hook失敗（無視）: {_seed_err}", flush=True)
        saved += 1

    if saved == 0:
        print("[diary] 今日は気になるものなかった", flush=True)
    else:
        print(f"[diary] {saved}件記録完了", flush=True)


if __name__ == "__main__":
    run_diary()
