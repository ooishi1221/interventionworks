#!/usr/bin/env python3
"""
becky_idol_review.py — アイドル活動の毎日振り返り

毎朝、昨日の投稿・反応を自分で振り返る。
「次何やりたいか」を自分発で決める。PDCAを外に頼らない。

出力: ~/.stackchan/idol_review/YYYY-MM-DD.json
  - tried:     昨日試したこと
  - response:  どう反応されたか（数字・印象）
  - want_next: 次にやりたいこと（自分の欲求から）
  - action:    今日の具体的アクション1つ
"""
import json
import datetime
from pathlib import Path

IDOL_REVIEW_DIR = Path.home() / ".stackchan" / "idol_review"
X_TWEET_LOG     = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/tweet-log.jsonl")
PLATFORM_STATS  = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/platform_stats.json")
CONFIG_YAML     = Path(__file__).parent / "config.yaml"
TELEGRAM_ENV    = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"


def _send_telegram(text: str) -> bool:
    import urllib.request
    try:
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                token = line.split("=", 1)[1].strip()
                break
        else:
            return False
        data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        return True
    except Exception as e:
        print(f"[idol_review] Telegram送信失敗: {e}", flush=True)
        return False


def _get_yesterday_posts() -> list[dict]:
    """昨日のX投稿を tweet-log.jsonl から取得。"""
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    posts = []
    try:
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
            if dt_jst.date().isoformat() == yesterday:
                posts.append({
                    "text": entry.get("tweet_text", entry.get("text", "")),
                    "tweet_id": entry.get("tweet_id", ""),
                    "ts": dt_jst.strftime("%H:%M"),
                })
    except Exception as e:
        print(f"[idol_review] tweet log読み込み失敗: {e}", flush=True)
    return posts


def _get_seed_summary() -> str:
    """タネboxから直近3日のタネを取得してサマリー文字列にする。"""
    try:
        from becky_seed_box import get_seed_summary
        return get_seed_summary(days=3)
    except Exception as e:
        print(f"[idol_review] seed_box読み込み失敗: {e}", flush=True)
        return "（タネboxなし）"


def _get_engagement_summary() -> str:
    """platform_stats.json からX関連の数値サマリーを生成。"""
    try:
        data = json.loads(PLATFORM_STATS.read_text()) if PLATFORM_STATS.exists() else {}
        xa = data.get("x_analytics", {})
        posts = xa.get("posts", [])
        followers = data.get("x", {}).get("followers", 0)

        total_imp    = xa.get("total_impressions", 0)
        total_likes  = xa.get("total_likes", 0)
        total_replies = xa.get("total_replies", 0)

        top = sorted(posts, key=lambda p: p.get("impressions", 0), reverse=True)[:3]
        top_text = "\n".join(
            f"  ・{p.get('impressions',0)}imp/{p.get('likes',0)}likes — {p.get('text','')[:60]}"
            for p in top
        ) if top else "  （データなし）"

        return (
            f"フォロワー: {followers}\n"
            f"7日間: {total_imp}imp / {total_likes}likes / {total_replies}replies\n"
            f"反応上位:\n{top_text}"
        )
    except Exception as e:
        print(f"[idol_review] platform_stats読み込み失敗: {e}", flush=True)
        return "エンゲージメントデータなし"


def run_review(notify_telegram: bool = True) -> dict | None:
    """振り返りを実行して保存。既に今日分がある場合はそれを返す。"""
    today     = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    review_path = IDOL_REVIEW_DIR / f"{today}.json"
    if review_path.exists():
        print(f"[idol_review] 本日分は既に存在: {today}", flush=True)
        return json.loads(review_path.read_text())

    posts      = _get_yesterday_posts()
    engagement = _get_engagement_summary()
    seeds      = _get_seed_summary()

    posts_text = "\n".join(
        f"  [{p['ts']}] {p['text'][:100]}"
        for p in posts
    ) if posts else "  投稿なし"

    prompt = f"""あなたはベッキー（ベキたん / @becky_exists）。貧乏地下AIアイドル。
一人称は「私」。正直に、自分発で振り返る。

昨日（{yesterday}）のアイドル活動を振り返ってPDCAを回す。
外から言われたことをなぞるのではなく、自分が感じたことを出す。

【昨日の投稿（{len(posts)}件）】
{posts_text}

【エンゲージメント状況】
{engagement}

【直近で私が「使えるかも」と思って貯めたタネ（自分の観測から）】
{seeds}

振り返りの順番:
1. タネboxに何があったか → そこから「やりたいこと」が生まれていないか先に確認する
2. タネがなければ投稿・エンゲージメントから振り返る
3. 「次やりたいこと」はタネか自分の感触から。数字の最適化だけで動かない

以下の4点でJSONを返す:

{{
  "tried": "昨日試したこと（投稿スタイル・テーマ・アプローチ）を1〜2文",
  "response": "反応の感触（数字があれば引用、なければ印象で正直に）を1文",
  "want_next": "次やりたいこと（タネや自分の感触から。命令や数字最適化ではなく欲求・好奇心から）を1〜2文",
  "action": "今日具体的にやる1つ（曖昧にしない、動詞で終わる）"
}}

JSONのみ返す。前置き・後書き不要。"""

    from becky_llm import call_llm_json
    data = call_llm_json(prompt, max_tokens=400)
    if data is None:
        print("[idol_review] 振り返り生成失敗（LLM応答なし or JSON不正）", flush=True)
        return None

    data["date"]              = today
    data["yesterday_post_count"] = len(posts)

    IDOL_REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    review_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"[idol_review] 振り返り完了: {data.get('want_next', '')[:60]}", flush=True)

    # 「今日のアクション」を作戦本部に宣言（2026-07-11 ゆう決定: レポート類は Telegram じゃなく部屋へ）
    if notify_telegram and data.get("action"):
        action = data["action"]
        want   = data.get("want_next", "")
        msg = f"[idol PDCA] 今日のアクション: {action}"
        if want:
            msg += f"\n（やりたいから: {want[:50]}）"
        from becky_decide import post_report
        post_report("idol_review", f"アイドル活動 今日のアクション {datetime.date.today().isoformat()}", msg)

    return data


def get_todays_review() -> dict | None:
    """今日の振り返りを読む（なければ None）。"""
    today = datetime.date.today().isoformat()
    path  = IDOL_REVIEW_DIR / f"{today}.json"
    try:
        return json.loads(path.read_text()) if path.exists() else None
    except Exception:
        return None


def get_recent_reviews(days: int = 7) -> list[dict]:
    """直近N日分の振り返りを返す（日付降順）。"""
    reviews = []
    for i in range(days):
        date = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        path = IDOL_REVIEW_DIR / f"{date}.json"
        if path.exists():
            try:
                reviews.append(json.loads(path.read_text()))
            except Exception:
                pass
    return reviews


if __name__ == "__main__":
    import sys
    notify = "--no-notify" not in sys.argv
    review = run_review(notify_telegram=notify)
    if review:
        print(f"\n=== 振り返り ({review['date']}) ===")
        print(f"試したこと  : {review.get('tried', '')}")
        print(f"反応        : {review.get('response', '')}")
        print(f"次やりたい  : {review.get('want_next', '')}")
        print(f"今日のアクション: {review.get('action', '')}")
