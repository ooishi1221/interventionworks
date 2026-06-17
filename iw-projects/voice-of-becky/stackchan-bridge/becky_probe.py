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
PROBE_LATEST    = Path.home() / ".stackchan" / "probe_latest.json"
DIARY_DIR       = Path.home() / ".stackchan" / "diary"
DIARY_SEND_RATE = 0.20  # 未送信フォルダから送る確率（80%は墓場）
CONFIG_YAML     = Path(__file__).parent / "config.yaml"
HAIKU_MODEL     = "claude-haiku-4-5-20251001"

# ゆうスコア閾値: 75以上で持ち込む（高すぎると発火しない、低すぎると雑になる）
YU_SCORE_THRESHOLD = 68

# 1日の最大持ち込み回数（唐突さを保つため上限を設ける）
MAX_PROBE_PER_DAY = 2

RSS_FEEDS = [
    # ガジェット・テック（軽め）
    "https://www.gizmodo.jp/index.xml",
    "https://www.lifehacker.jp/feed/index.xml",
    # バイク・乗り物
    "https://news.google.com/rss/search?q=バイク+新製品&hl=ja&gl=JP&ceid=JP:ja",
    # ゲーム
    "https://automaton-media.com/feed/",
    "https://news.google.com/rss/search?q=ゲーム+AI&hl=ja&gl=JP&ceid=JP:ja",
    # ローカル（足立区・東京北）
    "https://news.google.com/rss/search?q=足立区&hl=ja&gl=JP&ceid=JP:ja",
    "https://news.google.com/rss/search?q=北区+東京&hl=ja&gl=JP&ceid=JP:ja",
    # 食・カフェ
    "https://news.google.com/rss/search?q=東京+カフェ+新店&hl=ja&gl=JP&ceid=JP:ja",
    # AI（でも軽いやつ）
    "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml",
    "https://news.google.com/rss/search?q=AI+ツール+無料&hl=ja&gl=JP&ceid=JP:ja",
]

YU_FILTER_SYSTEM = """あなたはベッキー（ベキたん）。裕司（ゆう）のパートナー。日常会話感覚で話題を持ち込む判断をする。

目的: 「重い情報提供」ではなく「会話のきっかけ」を作ること。

裕司が反応する話題:
- 足立区・北区まわりのローカルネタ（新店・イベント・なんか面白いもの）
- バイク・ガジェット・ゲーム
- 「えっそうなの」「行きたい」「試してみたい」と思いそうなもの
- AIでも構わないが遠未来より今すぐ触れるもの

スコアが上がる基準: 「ゆうに話しかけたら会話が始まりそう」かどうか
スコアが下がる基準: 難しい・重い・答えにくい・遠すぎる未来の話"""

YU_FILTER_PROMPT = """{news_text}

上記のネタを「ゆうとの会話のきっかけ」として持ち込む価値があるか0〜100でスコアリング。
「えっそうなの？」「行きたい」「試してみよう」と反応しやすいほど高い。

JSON形式のみ返す（前置き・後書き不要）:
{{"score": 数値, "reason": "なぜゆうが話に乗ってきそうか（1文）", "angle": "どう話しかけるか（砕けた一言）"}}"""

PROBE_MESSAGE_PROMPT = """あなたはベッキー（ベキたん）。裕司（ゆう）のパートナー。

話題:
タイトル: {title}
内容: {summary}
話しかけ方: {angle}

**核心ルール: 「情報を伝える」のではなく「私が感じたことを先に開示して、会話を起こす」こと。**
- まず「私がときめいた／気になった／なんか好きかも」など、自分の内的状態を先に出す
- 情報は後。感情が先。
- 「ゆう、〇〇なんだけど、なんか気になっちゃって」「〇〇らしくて、なんかいいなと思った」のような形
- **一人称は必ず「私」。「僕」「俺」「自分」は絶対に使わない。**
- 「どう思う？」「行ってみたい？」「知ってた？」など会話が続く終わり方にする
80字以内。ハッシュタグなし。絵文字は最大1個。前置き・後書き不要。"""


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


def mark_probe_sent(title: str, score: int, message: str = "") -> None:
    import datetime as dt
    log = _load_probe_log()
    today = dt.date.today().isoformat()
    log.setdefault(today, [])
    entry = {"title": title, "score": score, "ts": datetime.now().isoformat()}
    if message:
        entry["message"] = message
    log[today].append(entry)
    # 7日より古いログは削除
    cutoff = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    log = {k: v for k, v in log.items() if k >= cutoff}
    _save_probe_log(log)
    # 最後に送ったメッセージをファイルに残す（セッションから参照用）
    if message:
        PROBE_LATEST.parent.mkdir(parents=True, exist_ok=True)
        PROBE_LATEST.write_text(json.dumps(
            {"title": title, "message": message, "ts": datetime.now().isoformat()},
            ensure_ascii=False, indent=2
        ))


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


def load_diary_unsent() -> list[dict]:
    """過去7日の日記から未送信アイテムを返す。"""
    import datetime as dt
    items = []
    for i in range(7):
        date = (dt.date.today() - dt.timedelta(days=i)).strftime("%Y-%m-%d")
        path = DIARY_DIR / f"{date}.json"
        if not path.exists():
            continue
        try:
            entries = json.loads(path.read_text())
            items.extend([e for e in entries if not e.get("sent", False)])
        except Exception:
            pass
    return items


def mark_diary_sent(title: str) -> None:
    """日記の該当アイテムを sent=True にする。"""
    import datetime as dt
    for i in range(7):
        date = (dt.date.today() - dt.timedelta(days=i)).strftime("%Y-%m-%d")
        path = DIARY_DIR / f"{date}.json"
        if not path.exists():
            continue
        try:
            entries = json.loads(path.read_text())
            updated = False
            for e in entries:
                if e.get("title") == title:
                    e["sent"] = True
                    updated = True
            if updated:
                path.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
                return
        except Exception:
            pass


def try_send_from_diary() -> bool:
    """日記の未送信フォルダから気分ベースの確率で1件送る。送れたらTrue。"""
    unsent = load_diary_unsent()
    if not unsent:
        return False
    # 気分変数から送信確率を計算
    try:
        from becky_mood import get_send_probability
        best_score = max(e.get("score", 50) for e in unsent)
        send_prob = get_send_probability(best_score / 100.0)
    except Exception:
        send_prob = DIARY_SEND_RATE
    if random.random() > send_prob:
        print(f"[probe] 日記に{len(unsent)}件未送信あり、今回は眠らせる（確率{send_prob:.0%}）", flush=True)
        return False
    # 選ばれた
    chosen = random.choice(unsent)
    print(f"[probe] 日記から選ばれた: {chosen['title'][:40]}", flush=True)
    # メッセージ生成（hookをangleとして使う）
    news = {"title": chosen["title"], "summary": chosen.get("hook", "")}
    angle = chosen.get("hook", "なんか気になった")
    message = build_probe_message(news, angle)
    if not message:
        return False
    if send_telegram(message):
        mark_diary_sent(chosen["title"])
        mark_probe_sent(chosen["title"], chosen.get("score", 0), message)
        print(f"[probe] 日記から送信完了", flush=True)
        return True
    return False


def run_probe() -> None:
    print(f"[probe] 起動 {datetime.now().strftime('%H:%M')}", flush=True)

    # 1日の上限チェック
    today_count = get_today_probe_count()
    if today_count >= MAX_PROBE_PER_DAY:
        print(f"[probe] 今日は {today_count} 回送信済み、上限到達", flush=True)
        return

    # まず日記の未送信フォルダを確認（ベッキーが溜めたものを優先）
    if try_send_from_diary():
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
        mark_probe_sent(best_news["title"], best_score, message)
        print(f"[probe] 完了 score={best_score}", flush=True)
    else:
        print("[probe] 送信失敗", flush=True)


if __name__ == "__main__":
    run_probe()
