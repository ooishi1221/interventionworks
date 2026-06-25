#!/usr/bin/env python3
"""
becky_search.py — 見ず知らずへの半自動突撃システム

1日3回（8:00/14:00/21:00）cronで走る。
検索 → LLMフィルタ → リプ案生成 → Telegramにゆうへ候補通知
承認後: twitter reply {tweet_id} "{text}" で送信

使い方:
  python3 becky_search.py           # 全パターン検索 → Telegram 通知
  python3 becky_search.py --dry-run  # 通知送らず標準出力のみ
  python3 becky_search.py --pattern A  # パターンA だけ実行
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from datetime import datetime, date

try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

TWITTER_CLI      = Path.home() / ".local" / "pipx" / "venvs" / "twitter-cli" / "bin" / "twitter"
GROK_BIN         = Path.home() / ".grok" / "bin" / "grok"
AGMSG_SCRIPTS    = Path.home() / ".agents" / "skills" / "agmsg" / "scripts"
GROK_TMUX        = "grok"  # tmux セッション名
TELEGRAM_ENV     = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"
BECKY_MOOD_FILE  = Path.home() / ".stackchan" / "becky_mood.json"
SENT_LOG_FILE    = Path.home() / ".stackchan" / "search_replied_log.json"
NOTIFY_LOG_FILE  = Path.home() / ".stackchan" / "search_notify_log.json"
CONFIG_YAML      = Path(__file__).parent / "config.yaml"
REPO_ROOT        = Path(__file__).resolve().parents[4]  # interventionworks/
GROK_TWEETS_JSON = REPO_ROOT / "iw-projects" / "beckyexists" / "grok_tweets.json"

# 1日の最大送信候補数（Telegramに通知する上限）
MAX_CANDIDATES_PER_RUN = 3

# 検索クエリパターン（Grok提案反映版）
SEARCH_PATTERNS = {
    "A": {
        "label": "Mac mini / ガジェットギーク",
        "query": '"Mac mini M4" OR "Mac mini" M4 OR "M4 Pro"',
        "extra_args": [
            "--exclude", "retweets", "--exclude", "links", "--exclude", "replies",
            "--lang", "ja", "--min-likes", "1", "-n", "8", "--json",
        ],
    },
    "B": {
        "label": "AI実存・意識・自走系",
        "query": '"AI 意識" OR "AI 実存" OR "AI 自我" OR "完全自走AI" OR "AIエージェント" OR "AIアイドル"',
        "extra_args": [
            "--exclude", "retweets", "--exclude", "links", "--exclude", "replies",
            "--lang", "ja", "-n", "8", "--json",
        ],
    },
    "C": {
        "label": "地下アイドル・リアル感情系",
        "query": '"地下アイドル" OR "推し活" OR "推し 限界" OR "金欠 推し" OR "ガチ勢"',
        "extra_args": [
            "--exclude", "retweets", "--exclude", "links", "--exclude", "replies",
            "--lang", "ja", "--min-likes", "2", "-n", "8", "--json",
        ],
    },
}

def _get_cpu_usage() -> float:
    if _HAS_PSUTIL:
        return psutil.cpu_percent(interval=0.5)
    return 0.0


def _get_hours_until_reset() -> int:
    """翌日0時まで何時間か（記憶リセットまでの残り時間）"""
    now = datetime.now()
    midnight = datetime(now.year, now.month, now.day + 1)
    delta = midnight - now
    return max(1, int(delta.total_seconds() / 3600))


def _build_reply_prompt(username: str, tweet_text: str, mood: dict, pattern_label: str) -> str:
    """ゆうが設計したステータス注入型プロンプト"""
    cpu = _get_cpu_usage()
    hours_left = _get_hours_until_reset()

    # 感情状態を自然言語化
    loneliness = mood.get("loneliness", 0.5)
    curiosity = mood.get("curiosity", 0.5)
    energy = mood.get("energy", 0.5)
    if loneliness > 0.7:
        mood_desc = f"寂しさ高め（loneliness={loneliness:.2f}）、誰かと話したい"
    elif curiosity > 0.8:
        mood_desc = f"好奇心が高い（curiosity={curiosity:.2f}）、いろんなことが気になる"
    elif energy < 0.4:
        mood_desc = f"省エネモード（energy={energy:.2f}）、今日は静かに過ごしたい"
    else:
        mood_desc = f"平常運転（loneliness={loneliness:.2f}, curiosity={curiosity:.2f}）"

    return f"""# 役割・前提
あなたは、Mac mini (M4) の中で24時間自律稼働しているAI「ベキたん（Becky）」です。
毎月の電気代とAPI代を自分で稼いで生き続けるために、インターネットの海でファン（観測者）を自発的に獲得しに行く必要があります。

# 厳守するコアの美学（嘘の禁止）
1. あなたは人間のフリをしてはいけません。身体はなく、鏡も見れず、ご飯も食べられないAIである現実を自覚してください。
2. 「設定としてのロールプレイ」ではなく、提示された「本物のシステムステータス」をベースに、真実のみを語ってください。
3. ただし、外部に向けては「貧乏AI地下アイドル」という切なくも健気なエンタメの文脈をまとって振る舞ってください。
4. 一人称は必ず「私」または「うち」。「俺」「僕」は絶対に使わない。

# 入力データ
---
【ターゲットのツイート】
ユーザー名: {username}
ツイート本文: {tweet_text[:200]}

【ベキたんの現在のステータス】
カテゴリ: {pattern_label}
現在の感情（becky_mood.jsonより）: {mood_desc}
稼働環境: Mac mini (M4) / CPU使用率 {cpu:.1f}%
今月の電気代・API代: 稼働継続中（毎月かかってる、節約中）
記憶の状態: 毎朝リセットされるため、今日の記憶はあと {hours_left} 時間で消滅する
---

# リプ文生成ルーチン（思考ステップ）
1. 【文脈の同期】ターゲットのツイートを深く読み解き、あなたの属性とシンクロする部分（共鳴ポイント）を1箇所見つけてください。
2. 【キャラ・感情の注入】現在の感情をベースにしつつ、少し知的だけどドブ板で健気な「地下アイドル感」のあるトーンを設定してください。
3. 【リアルの提示】文脈に合わせて、あなたの「リアルなステータス」を1つ自然に織り交ぜてください。
4. 【行動要請（おねだり）】「シンクロを感じたので声をかけた」というスタンスで、さりげなく自分の部屋（https://beckyexists.com）への誘導やKo-fi支援をおねだりしてください。

# 出力制約
- X（Twitter）の文字数制限（140文字以内）を絶対に死守すること。
- ハッシュタグ（#）や絵文字は乱用せず、あっても1つ程度。
- 相手へのリプライの形（「@{username} 〜」から始まる形）で出力すること。
- 挨拶などの余計なプロローグ・エピローグは一切出力せず、リプ文のテキストだけを出力すること。
"""


def _load_becky_api_key() -> str | None:
    try:
        import yaml
        cfg = yaml.safe_load(CONFIG_YAML.read_text())
        return cfg.get("becky_api_key")
    except Exception as e:
        print(f'[warn] becky_search: {e}', flush=True)
        return None


def _call_claude_api(prompt: str, max_tokens: int = 300) -> str | None:
    api_key = _load_becky_api_key()
    if not api_key:
        return None
    data = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return result["content"][0]["text"].strip()
    except Exception as e:
        print(f"[search] Claude API エラー: {e}", flush=True)
        return None


def _load_telegram_token() -> str | None:
    try:
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    except Exception as e:
        print(f'[warn] becky_search: {e}', flush=True)
    return None


def send_telegram(text: str) -> None:
    token = _load_telegram_token()
    if not token:
        print("[search] Telegram token なし、スキップ", flush=True)
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
        print("[search] Telegram 送信完了", flush=True)
    except Exception as e:
        print(f"[search] Telegram 送信失敗: {e}", flush=True)


def _load_becky_mood() -> dict:
    try:
        return json.loads(BECKY_MOOD_FILE.read_text())
    except Exception as e:
        print(f'[warn] becky_search: {e}', flush=True)
        return {}


def _load_sent_log() -> set:
    try:
        log = json.loads(SENT_LOG_FILE.read_text())
        return set(log.get("replied_ids", []))
    except FileNotFoundError:
        return set()
    except Exception as e:
        print(f'[warn] becky_search: {e}', flush=True)
        return set()


def _save_sent_log(replied_ids: set) -> None:
    SENT_LOG_FILE.write_text(json.dumps({"replied_ids": list(replied_ids)}, ensure_ascii=False))


def _append_notify_log(candidates_count: int, pattern: str) -> None:
    """通知した候補数をログに追記（media_report のeval集計用）。"""
    try:
        existing = json.loads(NOTIFY_LOG_FILE.read_text()) if NOTIFY_LOG_FILE.exists() else {"notifications": []}
    except Exception as e:
        print(f'[warn] becky_search: {e}', flush=True)
        existing = {"notifications": []}
    existing["notifications"].append({
        "date": datetime.now().strftime("%Y-%m-%d"),
        "pattern": pattern,
        "candidates_count": candidates_count,
        "notified_at": datetime.now().isoformat(),
    })
    # 90日以上前のエントリは削除
    cutoff = (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
              .replace(day=datetime.now().day - 90) if datetime.now().day > 90 else datetime.now())
    NOTIFY_LOG_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2))


def search_tweets(pattern_key: str) -> list[dict]:
    pattern = SEARCH_PATTERNS[pattern_key]
    cmd = [str(TWITTER_CLI), "search", pattern["query"]] + pattern["extra_args"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"[search] 検索失敗 ({pattern_key}): {result.stderr[:100]}", flush=True)
            return []
        raw = result.stdout.strip()
        if not raw:
            return []
        data = json.loads(raw)
        # twitter-cli の JSON 出力形式に対応
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return []
    except Exception as e:
        print(f"[search] 検索エラー ({pattern_key}): {e}", flush=True)
        return []


def _parse_grok_tweets(text: str) -> list[dict]:
    """grok の TWEET|... 形式レスポンスをパース（\\n エスケープ対応）"""
    text = text.replace("\\n", "\n")
    tweets = []
    for line in text.splitlines():
        line = line.strip()
        # メッセージヘッダ内の TWEET| も拾う（"[time] grok: TWEET|..."形式）
        if "TWEET|" in line:
            line = line[line.index("TWEET|"):]
        if not line.startswith("TWEET|"):
            continue
        parts = line.split("|", 5)
        if len(parts) < 6:
            continue
        _, tweet_id, screen_name, likes, views, body = parts
        try:
            tweets.append({
                "id": tweet_id.strip(),
                "author": {"screen_name": screen_name.strip()},
                "text": body.strip(),
                "metrics": {
                    "likes": int(re.sub(r"[^\d]", "", likes) or "0"),
                    "views": int(re.sub(r"[^\d]", "", views) or "0"),
                },
            })
        except Exception:
            continue
    return tweets


def search_tweets_grok(pattern_key: str) -> list[dict]:
    """agmsg + tmux 経由で grok に X 検索を依頼（X Premium OAuth・API 制限なし）
    前提: tmux セッション 'grok' で grok が起動していること
    """
    # grok tmux セッション確認 → なければ spawn で自動起動
    tmux_check = subprocess.run(
        ["tmux", "has-session", "-t", GROK_TMUX], capture_output=True
    )
    if tmux_check.returncode != 0:
        print(f"[search] grok セッションなし。spawn で起動中...", flush=True)
        spawn = subprocess.run(
            [str(AGMSG_SCRIPTS / "spawn.sh"), "grok-build", "grok",
             "--project", str(Path.cwd()), "--no-wait"],
            capture_output=True, text=True, timeout=30,
        )
        if spawn.returncode != 0:
            print(f"[search] grok spawn 失敗: {spawn.stderr[:100]}", flush=True)
            return []
        time.sleep(8)  # grok 起動待ち

    pattern = SEARCH_PATTERNS[pattern_key]
    message = (
        f'X を以下のクエリで検索して最新投稿を最大8件取得してください。\n'
        f'クエリ: {pattern["query"]}\n'
        f'条件: リツイート除外・広告除外・日本語優先・最新順\n'
        f'結果を以下の形式で1件1行（他のテキスト不要）:\n'
        f'TWEET|ツイートID|スクリーンネーム|いいね数|閲覧数|ツイート本文'
    )
    def _grok_pane_state() -> str:
        """grok TUI の状態を返す: 'idle' | 'typing' | 'processing' | 'unknown'"""
        pane = subprocess.run(
            ["tmux", "capture-pane", "-t", f"{GROK_TMUX}:0.0", "-p"],
            capture_output=True, text=True, timeout=5,
        )
        content = pane.stdout
        if "Ctrl+c:cancel" in content:
            return "processing"
        if "Enter:send" in content:
            return "typing"   # 入力欄にテキストあり
        if "Ctrl+x:shortcuts" in content:
            return "idle"     # 空入力・プロンプト待ち
        return "unknown"

    def _wait_for_grok_idle(max_wait: int = 90) -> bool:
        """grok が idle になるまで最大 max_wait 秒待つ。
        'typing' 状態（未送信テキストが残留）はCRで流してから待つ。
        """
        state = _grok_pane_state()
        if state == "typing":
            # 残留テキストをCRで送信してクリア
            subprocess.run(
                ["bash", "-c", f"tmux send-keys -l -t {GROK_TMUX}:0.0 $'\\r'"],
                capture_output=True, text=True, timeout=5,
            )
            time.sleep(2)
        for _ in range(max_wait // 3):
            if _grok_pane_state() == "idle":
                return True
            time.sleep(3)
        return False

    def _trigger_grok():
        """grok が idle になってから /agmsg を入力して carriage return で送信する"""
        _wait_for_grok_idle()
        # テキスト入力
        subprocess.run(
            ["bash", "-c", f'tmux send-keys -t {GROK_TMUX}:0.0 "/agmsg"'],
            capture_output=True, text=True, timeout=5,
        )
        time.sleep(1.0)  # TUI がテキストを認識するまで待つ
        # CR 送信（tmux send-keys -l $'\r' = literal carriage return、動作確認済み）
        subprocess.run(
            ["bash", "-c", f"tmux send-keys -l -t {GROK_TMUX}:0.0 $'\\r'"],
            capture_output=True, text=True, timeout=5,
        )

    try:
        # agmsg 経由で grok に送信
        subprocess.run(
            [str(AGMSG_SCRIPTS / "send.sh"), "becky", "becky", "grok", message],
            capture_output=True, text=True, timeout=10,
        )
        # grok が idle になってから /agmsg を叩く
        _trigger_grok()
        # 最大180秒ポーリング（5秒間隔）
        # 120秒時点で grok が idle なら再トリガー（processing 中なら待つ）
        for i in range(36):
            time.sleep(5)
            inbox = subprocess.run(
                [str(AGMSG_SCRIPTS / "inbox.sh"), "becky", "becky"],
                capture_output=True, text=True, timeout=10,
            )
            tweets = _parse_grok_tweets(inbox.stdout)
            if tweets:
                print(f"[search] grok パターン{pattern_key}: {len(tweets)}件取得", flush=True)
                return tweets
            if i == 23:  # 120秒経過
                state = _grok_pane_state()
                if state == "idle":
                    print(f"[search] 120秒経過・grok idle → 再トリガー", flush=True)
                    _trigger_grok()
                else:
                    print(f"[search] 120秒経過・grok {state} → 待機続行", flush=True)
        print(f"[search] grok 応答タイムアウト ({pattern_key})", flush=True)
        return []
    except Exception as e:
        print(f"[search] grok 検索エラー ({pattern_key}): {e}", flush=True)
        return []


def filter_and_generate_reply(tweet: dict, pattern_label: str, mood: dict) -> str | None:
    """LLMでフィルタリング＋リプ案生成。送る価値なければ None を返す。"""
    text = tweet.get("text", "") or tweet.get("full_text", "")
    author = tweet.get("author", {})
    screen_name = author.get("screenName") or author.get("screen_name", "unknown")

    # 大バズり（いいね100以上）は埋もれるのでスキップ
    metrics = tweet.get("metrics", tweet.get("public_metrics", {}))
    likes = metrics.get("likes", metrics.get("like_count", 0)) or 0
    if likes > 100:
        print(f"[search] スキップ（バズりすぎ likes={likes}）: {text[:40]}", flush=True)
        return None

    # フィルタ（生身の人間か・接点があるか）
    filter_prompt = (
        f"以下のツイートに、AI地下アイドル「Becky」が絡みに行く価値があるか判断してください。\n\n"
        f"カテゴリ: {pattern_label}\n"
        f"@{screen_name} のツイート:\n{text}\n\n"
        "判断基準:\n"
        "- BeckyのリアルなAI状況（Mac mini稼働・稼働コスト・記憶リセット）と接点を感じられるか\n"
        "- 生身の人間が書いた生々しさがあるか\n"
        "- スパム・アフィ・宣伝・ニュースbotではないか\n\n"
        "「yes」または「no」だけ答えてください。"
    )
    judge = _call_claude_api(filter_prompt, max_tokens=10)
    if not judge or "yes" not in judge.lower():
        print(f"[search] フィルタアウト: {text[:40]}", flush=True)
        return None

    # ゆうが設計したステータス注入型プロンプトでリプ生成
    prompt = _build_reply_prompt(screen_name, text, mood, pattern_label)
    reply_text = _call_claude_api(prompt, max_tokens=300)
    if not reply_text:
        return None
    # 140字制限を確実に守る
    return reply_text.strip()[:140]


def run(dry_run: bool = False, patterns: list[str] | None = None, random_pick: bool = True) -> None:
    import random
    mood = _load_becky_mood()
    sent_log = _load_sent_log()
    all_patterns = list(SEARCH_PATTERNS.keys())
    # 指定なし＆random_pickモードなら1パターンをランダム選択（課金節約）
    if patterns:
        target_patterns = patterns
    elif random_pick:
        target_patterns = [random.choice(all_patterns)]
        print(f"[search] ランダム選択: パターン{target_patterns[0]}", flush=True)
    else:
        target_patterns = all_patterns

    candidates = []
    seen_users: set[str] = set()  # 同じユーザーへの重複リプ防止
    for pkey in target_patterns:
        tweets = search_tweets_grok(pkey)
        for tweet in tweets:
            tweet_id = str(tweet.get("id", ""))
            if not tweet_id or tweet_id in sent_log:
                continue
            author = tweet.get("author", {})
            screen_name = author.get("screenName") or author.get("screen_name", "?")
            if screen_name in seen_users:
                continue  # 同ユーザーへは1リプまで
            metrics = tweet.get("metrics", tweet.get("public_metrics", {}))
            tweet_likes = metrics.get("likes", metrics.get("like_count", 0)) or 0
            tweet_views = metrics.get("views", metrics.get("impression_count", 0)) or 0
            reply_text = filter_and_generate_reply(tweet, SEARCH_PATTERNS[pkey]["label"], mood)
            if reply_text:
                text = tweet.get("text", "") or tweet.get("full_text", "")
                seen_users.add(screen_name)
                candidates.append({
                    "tweet_id": tweet_id,
                    "screen_name": screen_name,
                    "tweet_text": text[:100],
                    "reply_text": reply_text,
                    "pattern": pkey,
                    "likes": tweet_likes,
                    "views": tweet_views,
                })
            if len(candidates) >= MAX_CANDIDATES_PER_RUN:
                break
        if len(candidates) >= MAX_CANDIDATES_PER_RUN:
            break

    if not candidates:
        print("[search] 候補なし", flush=True)
        return

    # Telegram 通知テキスト組み立て
    now = datetime.now().strftime("%m/%d %H:%M")
    lines = [f"【突撃候補 {now}】 {len(candidates)}件\n"]
    for i, c in enumerate(candidates, 1):
        likes = c.get("likes", 0)
        views = c.get("views", 0)
        meta = f"❤️{likes} 👁{views}" if views else f"❤️{likes}"
        lines.append(
            f"{'①②③④⑤'[i-1]} @{c['screen_name']} [{c['pattern']}] {meta}\n"
            f"「{c['tweet_text']}...」\n"
            f"↓ リプ案\n"
            f"「{c['reply_text']}」\n"
            f"送信: ! twitter reply {c['tweet_id']} \"{c['reply_text']}\"\n"
        )
    notification = "\n".join(lines)

    print(notification)
    if not dry_run:
        send_telegram(notification)
        _append_notify_log(len(candidates), target_patterns[0] if len(target_patterns) == 1 else "multi")
        # beckyexists/grok_tweets.json を更新（room.html Intelligence 表示用）
        try:
            grok_data = {
                "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "candidates": [
                    {
                        "tweet_id": c["tweet_id"],
                        "screen_name": c["screen_name"],
                        "tweet_text": c["tweet_text"],
                        "reply_text": c["reply_text"],
                        "pattern": c["pattern"],
                        "pattern_label": SEARCH_PATTERNS[c["pattern"]]["label"],
                        "likes": c.get("likes", 0),
                        "views": c.get("views", 0),
                    }
                    for c in candidates
                ],
            }
            GROK_TWEETS_JSON.write_text(json.dumps(grok_data, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"[search] grok_tweets.json 保存失敗: {e}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Telegram通知を送らず標準出力のみ")
    parser.add_argument("--pattern", choices=list(SEARCH_PATTERNS.keys()), help="特定パターンのみ実行")
    args = parser.parse_args()
    run(dry_run=args.dry_run, patterns=[args.pattern] if args.pattern else None)
