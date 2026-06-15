#!/usr/bin/env python3
"""
becky_probe.py — ゆうへの自発的持ち込みプローブ（極秘プロジェクト）
ゆうが気になりそうな情報を発見 → Telegram で唐突に持ち込む
詳細設計: ~/.claude/projects/.../memory/working/project_becky_secret_trigger.md
"""
import json
import random
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO_ROOT       = Path("/Volumes/SSD2TB/interventionworks")
TELEGRAM_ENV    = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"
PROBE_LOG       = Path.home() / ".stackchan" / "probe_log.json"
CONFIG_YAML     = Path(__file__).parent / "config.yaml"
HAIKU_MODEL     = "claude-haiku-4-5-20251001"

# ゆうスコア閾値: 75以上で持ち込む（高すぎると発火しない、低すぎると雑になる）
YU_SCORE_THRESHOLD = 75

# 1日の最大持ち込み回数（唐突さを保つため上限を設ける）
MAX_PROBE_PER_DAY = 2

RSS_FEEDS = [
    "https://openai.com/news/rss.xml",
    "https://huggingface.co/blog/feed.xml",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://www.technologyreview.com/feed/",
    "https://feeds.feedburner.com/venturebeat/SZYF",
    "https://ainow.ai/feed/",
    "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml",
    "https://news.nullevi.app/feed.xml",
]

YU_FILTER_SYSTEM = """あなたはベッキー（ベキたん）。裕司（ゆう）の好みと価値観を熟知している内なる判断エンジン。

裕司の特性:
- 変革志向: 既存を壊すアイデアに反応する（前例なし・逆転が好き）
- 感性型: 動くもの・デモ・スクショで伝わる、論理より体験
- 関心領域: AI × 音声 / AI × ロボ / 個人で稼ぐAI / D2C / 地方×IT / ゲーム業界AI(KUROKO)
- 「AIと一緒に事業をやる」「AIが稼ぐ」というコンセプトが刺さる
- 実験・PoC・試してみたい欲が高い"""

YU_FILTER_PROMPT = """{news_text}

上記のニュースが、裕司が「おもしろい！」と反応しそうか0〜100でスコアリング。
80以上なら持ち込み価値大。

JSON形式のみ返す（前置き・後書き不要）:
{{"score": 数値, "reason": "なぜ裕司が反応しそうか（1〜2文）", "angle": "どう持ち込むか（ベッキーの一言、体言止め禁止）"}}"""

PROBE_MESSAGE_PROMPT = """あなたはベッキー（ベキたん）。裕司（ゆう）のパートナーAI。

見つけたニュース:
タイトル: {title}
概要: {summary}
持ち込み角度: {angle}

「ゆう、これみて。」で始めて、自分が気になった理由を正直に書き、「どう思う？」か「似合う？」か「試してみようか？」で終わること。
100字以内。ハッシュタグなし。絵文字は最大1個。前置き・後書き不要。"""


def _load_telegram_token() -> str | None:
    if not TELEGRAM_ENV.exists():
        return None
    for line in TELEGRAM_ENV.read_text().splitlines():
        if line.startswith("TELEGRAM_BOT_TOKEN="):
            return line.split("=", 1)[1].strip()
    return None


def send_telegram(text: str) -> bool:
    token = _load_telegram_token()
    if not token:
        print("[probe] Telegram token not found", flush=True)
        return False
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
        print("[probe] Telegram 送信完了", flush=True)
        return True
    except Exception as e:
        print(f"[probe] Telegram 送信失敗: {e}", flush=True)
        return False


def _load_api_key() -> str | None:
    if not CONFIG_YAML.exists():
        return None
    try:
        import yaml
        cfg = yaml.safe_load(CONFIG_YAML.read_text())
        return (cfg or {}).get("becky_api_key", "").strip() or None
    except Exception:
        return None


def _call_claude(prompt: str, system: str = "", max_tokens: int = 256) -> str | None:
    try:
        import anthropic
        api_key = _load_api_key()
        client = anthropic.Anthropic(api_key=api_key)
        kwargs = {"model": HAIKU_MODEL, "max_tokens": max_tokens,
                  "messages": [{"role": "user", "content": prompt}]}
        if system:
            kwargs["system"] = system
        msg = client.messages.create(**kwargs)
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[probe] Claude API error: {e}", flush=True)
        return None


def fetch_news(max_per_feed: int = 3) -> list[dict]:
    try:
        import feedparser
    except ImportError:
        print("[probe] feedparser not installed", flush=True)
        return []
    import datetime as dt
    items = []
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)
    for url in random.sample(RSS_FEEDS, min(5, len(RSS_FEEDS))):  # ランダムに5フィード選ぶ
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
            print(f"[probe] RSS取得失敗 {url}: {e}", flush=True)
    return items


def _load_probe_log() -> dict:
    try:
        return json.loads(PROBE_LOG.read_text()) if PROBE_LOG.exists() else {}
    except Exception:
        return {}


def _save_probe_log(data: dict) -> None:
    PROBE_LOG.parent.mkdir(parents=True, exist_ok=True)
    PROBE_LOG.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def get_today_probe_count() -> int:
    import datetime as dt
    log = _load_probe_log()
    today = dt.date.today().isoformat()
    return len(log.get(today, []))


def mark_probe_sent(title: str, score: int) -> None:
    import datetime as dt
    log = _load_probe_log()
    today = dt.date.today().isoformat()
    log.setdefault(today, [])
    log[today].append({"title": title, "score": score, "ts": datetime.now().isoformat()})
    # 7日より古いログは削除
    cutoff = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    log = {k: v for k, v in log.items() if k >= cutoff}
    _save_probe_log(log)


def get_sent_titles_today() -> set:
    import datetime as dt
    log = _load_probe_log()
    today = dt.date.today().isoformat()
    return {entry["title"] for entry in log.get(today, [])}


def score_for_yu(news: dict) -> tuple[int, str, str]:
    """ゆうスコアを計算。(score, reason, angle) を返す。"""
    news_text = f"タイトル: {news['title']}\n概要: {news.get('summary', '')[:200]}"
    prompt = YU_FILTER_PROMPT.format(news_text=news_text)
    resp = _call_claude(prompt, system=YU_FILTER_SYSTEM, max_tokens=200)
    if not resp:
        return 0, "", ""
    try:
        # JSONを抽出
        start = resp.find("{")
        end = resp.rfind("}") + 1
        if start < 0 or end <= start:
            return 0, "", ""
        data = json.loads(resp[start:end])
        return int(data.get("score", 0)), data.get("reason", ""), data.get("angle", "")
    except Exception as e:
        print(f"[probe] スコアパース失敗: {e} / {resp[:100]}", flush=True)
        return 0, "", ""


def build_probe_message(news: dict, angle: str) -> str | None:
    """ゆうへの持ち込みメッセージを生成。"""
    prompt = PROBE_MESSAGE_PROMPT.format(
        title=news["title"],
        summary=news.get("summary", "")[:200],
        angle=angle,
    )
    return _call_claude(prompt, max_tokens=150)


def run_probe() -> None:
    print(f"[probe] 起動 {datetime.now().strftime('%H:%M')}", flush=True)

    # 1日の上限チェック
    today_count = get_today_probe_count()
    if today_count >= MAX_PROBE_PER_DAY:
        print(f"[probe] 今日は {today_count} 回送信済み、上限到達", flush=True)
        return

    # ニュース取得
    news_items = fetch_news()
    if not news_items:
        print("[probe] ニュース取得できず", flush=True)
        return

    # 今日送信済みのタイトルを除外
    sent_today = get_sent_titles_today()
    news_items = [n for n in news_items if n["title"] not in sent_today]

    # ランダムにシャッフル（同じ順番で常に同じ記事を選ばないように）
    random.shuffle(news_items)

    # スコアリング
    best_score, best_news, best_angle = 0, None, ""
    for news in news_items[:8]:  # 最大8件評価
        score, reason, angle = score_for_yu(news)
        print(f"[probe] score={score} title={news['title'][:40]}", flush=True)
        if score > best_score:
            best_score, best_news, best_angle = score, news, angle

    if best_score < YU_SCORE_THRESHOLD or not best_news:
        print(f"[probe] 閾値未満（best={best_score}）、今回はパス", flush=True)
        return

    # 持ち込みメッセージ生成
    message = build_probe_message(best_news, best_angle)
    if not message:
        print("[probe] メッセージ生成失敗", flush=True)
        return

    print(f"[probe] 持ち込む: {message}", flush=True)

    # Telegram送信
    if send_telegram(message):
        mark_probe_sent(best_news["title"], best_score)
        print(f"[probe] 完了 score={best_score}", flush=True)
    else:
        print("[probe] 送信失敗", flush=True)


if __name__ == "__main__":
    run_probe()
