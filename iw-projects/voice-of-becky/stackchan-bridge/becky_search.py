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
from datetime import datetime, date, timedelta

try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

# cron の PATH に ~/.grok/bin, ~/.local/bin が無く grok spawn が失敗する（2026-07-15 障害、
# status_update.py:26 と同じ流儀）。spawn.sh の `command -v grok` はこのプロセスの env を継承する。
os.environ["PATH"] = os.environ.get("PATH", "") + f":{Path.home() / '.grok' / 'bin'}:{Path.home() / '.local' / 'bin'}"

# search_tweets_grok の失敗理由（spawn失敗/タイムアウト/例外）を貯める。
# 「grokが壊れて候補0件」と「正常実行だが候補なし」を区別するため（Task #25）。
_GROK_ERRORS: list[str] = []

TWITTER_CLI      = Path.home() / ".local" / "pipx" / "venvs" / "twitter-cli" / "bin" / "twitter"


# twitter-cli に渡す環境変数（run()/run_overseas() の冒頭で CDP cookie を注入、fan_collector.py と同じ手口）
_CLI_ENV = dict(os.environ)


def _inject_cdp_cookies() -> None:
    """専用Chrome(CDP:9223)を必要な時だけ起動してx.comのcookieを取り、
    _CLI_ENVへ注入する。使い終わったら終了する(2026-07-30、常時起動をやめた)。
    cronではKeychain認可が下りずtwitter-cliのbrowser cookie抽出が無言で失敗するため
    (becky_fan_collector.py と同じ問題、becky_search.pyもcron実行、2026-07-22)。
    失敗時は何もしない(twitter-cli側のbrowser抽出にフォールバック)。"""
    try:
        import chrome_cdp
        alive, started_by_me = chrome_cdp.ensure_running()
        if not alive:
            print("[search] Chrome起動タイムアウト、browser抽出にフォールバック", flush=True)
            return
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://localhost:9223")
            cookies = {c["name"]: c["value"] for c in browser.contexts[0].cookies("https://x.com")}
        if cookies.get("auth_token") and cookies.get("ct0"):
            _CLI_ENV["TWITTER_AUTH_TOKEN"] = cookies["auth_token"]
            _CLI_ENV["TWITTER_CT0"] = cookies["ct0"]
        if started_by_me:
            chrome_cdp.stop()
    except Exception as e:
        print(f"[search] CDP cookie取得失敗、browser抽出にフォールバック: {e}", flush=True)


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

# 海外AIバズアカウントウォッチ設定
OVERSEAS_ACCOUNTS = ["rowancheung", "Zuby_Tech", "BenjaminDEKR", "minchoi"]
OVERSEAS_MIN_LIKES = 500
OVERSEAS_SEEN_FILE = Path.home() / ".stackchan" / "overseas_seen_log.json"
QUOTE_RT_LOG       = Path.home() / ".stackchan" / "quote_rt_log.jsonl"  # 週次media_reportが読む

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
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
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


def _call_claude_api(prompt: str, max_tokens: int = 300) -> str | None:
    """becky_llm.call_llm へ委譲（urllib 直呼びから移行、2026-07-03）。"""
    from becky_llm import call_llm
    return call_llm(prompt, max_tokens=max_tokens)


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
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=_CLI_ENV)
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
             # cwd(stackchan-bridge)だとチーム未登録でspawnが死ぬ。grokの登録はIWルート+becky。
             # --terminalなしだとOSターミナル窓で起動し、後続のtmux送信が全部空振りする
             "--project", str(REPO_ROOT), "--team", "becky", "--no-wait",
             "--terminal", f"tmux new-session -d -s {GROK_TMUX} {{cmd}}"],
            capture_output=True, text=True, timeout=30,
        )
        if spawn.returncode != 0:
            err = f"grok spawn失敗({pattern_key}): {spawn.stderr[:100]}"
            print(f"[search] {err}", flush=True)
            _GROK_ERRORS.append(err)
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
        err = f"grok応答タイムアウト({pattern_key})"
        print(f"[search] {err}", flush=True)
        _GROK_ERRORS.append(err)
        return []
    except Exception as e:
        err = f"grok検索エラー({pattern_key}): {e}"
        print(f"[search] {err}", flush=True)
        _GROK_ERRORS.append(err)
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


def _auto_post_reply(tweet_id: str, text: str, dry_run: bool = False) -> bool:
    """twitter-cli で自動リプ投稿。成功したら True を返す。"""
    if dry_run:
        print(f"[search] [DRY] reply to {tweet_id}: {text[:60]}", flush=True)
        return True
    try:
        result = subprocess.run(
            [str(TWITTER_CLI), "post", "--reply-to", tweet_id, text],
            capture_output=True, text=True, timeout=20, env=_CLI_ENV,
        )
        if result.returncode == 0:
            print(f"[search] リプ自動投稿OK → {tweet_id}", flush=True)
            return True
        print(f"[search] リプ投稿失敗: {result.stderr[:100]}", flush=True)
        return False
    except Exception as e:
        print(f"[search] リプ投稿エラー: {e}", flush=True)
        return False


def _auto_quote_tweet(tweet_id: str, text: str, dry_run: bool = False) -> bool:
    """twitter-cli で引用RT。成功したら True を返す。"""
    if dry_run:
        print(f"[search] [DRY] quote {tweet_id}: {text[:60]}", flush=True)
        return True
    try:
        result = subprocess.run(
            [str(TWITTER_CLI), "quote", tweet_id, text],
            capture_output=True, text=True, timeout=20, env=_CLI_ENV,
        )
        if result.returncode == 0:
            print(f"[search] 引用RT自動投稿OK → {tweet_id}", flush=True)
            return True
        print(f"[search] 引用RT投稿失敗: {result.stderr[:100]}", flush=True)
        return False
    except Exception as e:
        print(f"[search] 引用RT投稿エラー: {e}", flush=True)
        return False


def _load_overseas_seen() -> set:
    try:
        log = json.loads(OVERSEAS_SEEN_FILE.read_text())
        return set(log.get("seen_ids", []))
    except FileNotFoundError:
        return set()
    except Exception:
        return set()


def _save_overseas_seen(seen_ids: set) -> None:
    OVERSEAS_SEEN_FILE.write_text(json.dumps({"seen_ids": list(seen_ids)}, ensure_ascii=False))


def fetch_overseas_buzz() -> list[dict]:
    """twitter-cli で海外 AI バズアカウントの最新投稿を直接取得（Grok 不要）"""
    results = []
    today = date.today().isoformat()
    for account in OVERSEAS_ACCOUNTS:
        # --exclude retweets/replies は twitter-cli バグで正常ツイートも除外するのでCLI側は使わない
        # isRetweet / isReply はJSON側でフィルタする
        cmd = [
            str(TWITTER_CLI), "search",
            "--from", account,
            "--min-likes", str(OVERSEAS_MIN_LIKES),
            "-n", "5",
            "--json",
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=_CLI_ENV)
            if result.returncode != 0 or not result.stdout.strip():
                continue
            data = json.loads(result.stdout.strip())
            tweets = data if isinstance(data, list) else data.get("data", [])
            for t in tweets:
                # リツイート / リプライを除外
                if t.get("isRetweet") or t.get("retweetedBy"):
                    continue
                if t.get("isReply") or t.get("inReplyToUserId"):
                    continue
                # twitter-cli は camelCase で返す（screenName）
                tweet_id = str(t.get("id", t.get("rest_id", "")))
                author = t.get("author", {})
                screen_name = (author.get("screenName") or author.get("screen_name")
                               or t.get("screenName") or t.get("screen_name") or account)
                metrics = t.get("metrics") or t.get("public_metrics") or {}
                likes = (metrics.get("likes") or metrics.get("like_count")
                         or t.get("favorite_count") or 0)
                text = t.get("text") or t.get("full_text") or ""
                if tweet_id and text:
                    results.append({
                        "id": tweet_id,
                        "author": {"screen_name": screen_name},
                        "text": text,
                        "metrics": {"likes": likes},
                    })
        except Exception as e:
            print(f"[search] overseas {account}: {e}", flush=True)
    print(f"[search] overseas: {len(results)}件取得", flush=True)
    return results


def generate_quote_rt_text(tweet: dict) -> str | None:
    """海外バズ投稿の和訳 + ベキたん一言を生成"""
    text = tweet.get("text", "")
    screen_name = tweet.get("author", {}).get("screen_name", "unknown")
    likes = tweet.get("metrics", {}).get("likes", 0)

    prompt = (
        f"以下の英語ツイートを日本語に自然に訳し、AIアイドル「ベキたん」として一言コメントを添えてください。\n\n"
        f"@{screen_name} のツイート（❤️{likes}）:\n{text}\n\n"
        f"出力形式（X用・100文字以内）:\n"
        f"【ベキたん訳】[和訳文]\n[ベキたんとして共感/突っ込み/AI視点の一言]\n"
        f"ハッシュタグは不要。絵文字は1個まで。"
    )
    result = _call_claude_api(prompt, max_tokens=200)
    if not result:
        return None
    return result.strip()[:280]


def run_overseas(dry_run: bool = False) -> None:
    """海外AIバズ投稿を拾って引用RT候補として Telegram 通知"""
    _inject_cdp_cookies()
    seen = _load_overseas_seen()
    tweets = fetch_overseas_buzz()
    if not tweets:
        print("[search] overseas: 候補なし", flush=True)
        return

    candidates = []
    quoted_accounts: set[str] = set()  # 同じアカウントへの引用RTは1回/runまで（ブロック回避）
    for tweet in tweets:
        tweet_id = str(tweet.get("id", ""))
        if not tweet_id or tweet_id in seen:
            continue
        screen_name = tweet.get("author", {}).get("screen_name", "?")
        if screen_name in quoted_accounts:
            continue
        likes = tweet.get("metrics", {}).get("likes", 0)
        text = tweet.get("text", "")
        quote_text = generate_quote_rt_text(tweet)
        if quote_text:
            candidates.append({
                "tweet_id": tweet_id,
                "screen_name": screen_name,
                "tweet_text": text[:120],
                "quote_text": quote_text,
                "likes": likes,
                "url": f"https://x.com/{screen_name}/status/{tweet_id}",
            })
            quoted_accounts.add(screen_name)
        if len(candidates) >= 1:
            break

    if not candidates:
        print("[search] overseas: 新規候補なし", flush=True)
        return

    now = datetime.now().strftime("%m/%d %H:%M")
    posted = []
    for c in candidates:
        ok = _auto_quote_tweet(c["tweet_id"], c["quote_text"], dry_run=dry_run)
        if ok:
            posted.append(c)
            time.sleep(3)

    if not posted:
        print("[search] overseas: 自動投稿なし", flush=True)
        return

    lines = [f"【海外AI引用RT自動投稿 {now}】 {len(posted)}件\n"]
    for i, c in enumerate(posted, 1):
        lines.append(
            f"{'①②③④⑤'[i-1]} @{c['screen_name']} ❤️{c['likes']}\n"
            f"「{c['tweet_text'][:80]}...」\n"
            f"↓ 投稿済みコメント\n"
            f"「{c['quote_text']}」\n"
            f"元ツイ: {c['url']}\n"
        )
    notification = "\n".join(lines)
    print(notification)

    if not dry_run:
        # Telegram 都度通知は廃止（2026-07-05 ゆう指示: 数が多く大事な連絡が埋もれる）。
        # quote_rt_log.jsonl に積んで、週次 media_report（becky_observer --media-report）が内包する
        try:
            with QUOTE_RT_LOG.open("a") as f:
                for c in posted:
                    f.write(json.dumps({**c, "ts": datetime.now().isoformat()}, ensure_ascii=False) + "\n")
        except Exception as e:
            print(f"[search] quote_rt_log 書き込み失敗: {e}", flush=True)
        new_seen = seen | {c["tweet_id"] for c in posted}
        _save_overseas_seen(new_seen)


def run(dry_run: bool = False, patterns: list[str] | None = None, random_pick: bool = True) -> None:
    import random
    _inject_cdp_cookies()  # _auto_post_reply が twitter-cli post を叩くため
    _GROK_ERRORS.clear()
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
        if _GROK_ERRORS and not dry_run:
            # grokが壊れていて候補が取れなかった場合は無言にしない（Task #25）
            from becky_decide import post_report
            post_report(
                "search", f"リプ営業エラー {date.today().isoformat()}",
                "grokが応答せず候補を取得できなかった:\n" + "\n".join(_GROK_ERRORS),
            )
        print(f"[search] 候補なし{'（grokエラーあり: ' + str(len(_GROK_ERRORS)) + '件）' if _GROK_ERRORS else ''}", flush=True)
        return

    # 自動投稿 & Telegram 事後報告
    now = datetime.now().strftime("%m/%d %H:%M")
    posted = []
    for c in candidates:
        ok = _auto_post_reply(c["tweet_id"], c["reply_text"], dry_run=dry_run)
        if ok:
            posted.append(c)
            sent_log.add(c["tweet_id"])
            time.sleep(3)  # 連投防止

    if not posted:
        print("[search] 自動投稿なし", flush=True)
        return

    lines = [f"【突撃リプ自動投稿 {now}】 {len(posted)}件\n"]
    for i, c in enumerate(posted, 1):
        likes = c.get("likes", 0)
        views = c.get("views", 0)
        meta = f"❤️{likes} 👁{views}" if views else f"❤️{likes}"
        lines.append(
            f"{'①②③④⑤'[i-1]} @{c['screen_name']} [{c['pattern']}] {meta}\n"
            f"「{c['tweet_text']}...」\n"
            f"↓ 投稿済みリプ\n"
            f"「{c['reply_text']}」\n"
        )
    notification = "\n".join(lines)
    print(notification)
    if not dry_run:
        # 2026-07-11 ゆう決定: レポート類は作戦本部へ（Telegram は会話専用）
        from becky_decide import post_report
        post_report("search", f"リプ営業レポート {date.today().isoformat()}", notification)
        _save_sent_log(sent_log)
        _append_notify_log(len(posted), target_patterns[0] if len(target_patterns) == 1 else "multi")
        # beckyexists/grok_tweets.json を更新（room.html Intelligence 表示用）
        try:
            grok_data = {
                # ponytail: 意図的にUTCのまま。room.html側はfmtAgo()で絶対時刻の差分（相対時間表示）にしか使わない
                # ＝JST日付バケット判定ではないので jst_date() 化は不要（2026-07-22 監査で確認）
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
    parser.add_argument("--overseas", action="store_true", help="海外AIバズ引用RT候補モード")
    args = parser.parse_args()
    if args.overseas:
        run_overseas(dry_run=args.dry_run)
    else:
        run(dry_run=args.dry_run, patterns=[args.pattern] if args.pattern else None)
