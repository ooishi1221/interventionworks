#!/usr/bin/env python3
"""
becky_fan_collector.py — ファンイベント収集（Backstage データ基盤 Phase 0）

1日1回cron。<account> のフォロワー/フォロー中を取得し、前回スナップショットとの差分で
follow/unfollow イベントを検出。引用RTも検索してquoteイベントとして記録。
すべて ~/.stackchan/fan_events_<account>.jsonl に append-only で追記する。

ponytail: IPリスク対策で1日1回想定。リトライループしない、失敗時は前回スナップショット維持。

使い方:
  python3 becky_fan_collector.py [account]   # デフォルト: becky_exists
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TWITTER_CLI = Path.home() / ".local" / "pipx" / "venvs" / "twitter-cli" / "bin" / "twitter"
STACKCHAN_DIR = Path.home() / ".stackchan"
FETCH_N = 300
QUOTE_SEARCH_N = 20

# twitter-cli に渡す環境変数（main で CDP cookie を注入）
_CLI_ENV = dict(os.environ)


def _inject_cdp_cookies() -> None:
    """専用Chrome(CDP:9223)を必要な時だけ起動してx.comのauth_token/ct0を取り、
    _CLI_ENVへ注入する。使い終わったら終了する(2026-07-30、常時起動をやめた)。

    cronではKeychain認可が下りずtwitter-cliのbrowser cookie抽出が失敗するため、
    Chrome自身に復号させたcookieを環境変数(TWITTER_AUTH_TOKEN/TWITTER_CT0)で渡す。
    失敗時は何もしない（twitter-cli側のbrowser抽出にフォールバック）。
    """
    try:
        import chrome_cdp
        alive, started_by_me = chrome_cdp.ensure_running()
        if not alive:
            print("[fan_collector] Chrome起動タイムアウト、browser抽出にフォールバック", flush=True)
            return
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://localhost:9223")
            cookies = {c["name"]: c["value"]
                       for c in browser.contexts[0].cookies("https://x.com")}
        if cookies.get("auth_token") and cookies.get("ct0"):
            _CLI_ENV["TWITTER_AUTH_TOKEN"] = cookies["auth_token"]
            _CLI_ENV["TWITTER_CT0"] = cookies["ct0"]
            print("[fan_collector] CDP経由でcookie取得OK", flush=True)
        else:
            print("[fan_collector] CDPにx.comのauth cookieなし、browser抽出にフォールバック", flush=True)
        if started_by_me:
            chrome_cdp.stop()
    except Exception as e:
        print(f"[fan_collector] CDP cookie取得失敗、browser抽出にフォールバック: {e}", flush=True)


def _events_file(account: str) -> Path:
    return STACKCHAN_DIR / f"fan_events_{account}.jsonl"


def _snapshot_file(account: str) -> Path:
    return STACKCHAN_DIR / f"fan_snapshot_{account}.json"


def _quote_seen_file(account: str) -> Path:
    return STACKCHAN_DIR / f"fan_quote_seen_{account}.json"


def _fetch_screen_names(cmd: str, account: str) -> set[str] | None:
    """twitter followers/following <account> --json を叩いてscreen_nameの集合を返す。失敗時 None。"""
    try:
        result = subprocess.run(
            [str(TWITTER_CLI), cmd, account, "--json", "-n", str(FETCH_N)],
            capture_output=True, text=True, timeout=60, env=_CLI_ENV,
        )
        if result.returncode != 0 or not result.stdout.strip():
            print(f"[fan_collector] {cmd} 取得失敗: {result.stderr[:150]}", flush=True)
            return None
        data = json.loads(result.stdout)
        users = data.get("data", data) if isinstance(data, dict) else data
        return {
            u.get("screenName") or u.get("screen_name")
            for u in users if u.get("screenName") or u.get("screen_name")
        }
    except Exception as e:
        print(f"[fan_collector] {cmd} エラー: {e}", flush=True)
        return None


def _load_snapshot(account: str) -> dict:
    try:
        return json.loads(_snapshot_file(account).read_text())
    except Exception:
        return {"followers": [], "following": []}


def _save_snapshot(account: str, followers: set[str], following: set[str]) -> None:
    STACKCHAN_DIR.mkdir(parents=True, exist_ok=True)
    _snapshot_file(account).write_text(json.dumps({
        "followers": sorted(followers), "following": sorted(following),
        "updated_at": datetime.now().isoformat(),
    }, ensure_ascii=False))


def _append_events(account: str, events: list[dict]) -> None:
    if not events:
        return
    STACKCHAN_DIR.mkdir(parents=True, exist_ok=True)
    with _events_file(account).open("a") as f:
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")


def collect_follow_events(account: str) -> list[dict]:
    """前回スナップショットとの差分で follow/unfollow イベントを作る。
    初回実行（スナップショットなし）は現在のフォロワー全員を follow イベントとして記録する
    （= first_seen のブートストラップ。roster_build 側はこれに依存する）。
    """
    followers = _fetch_screen_names("followers", account)
    following = _fetch_screen_names("following", account)
    if followers is None or following is None:
        print("[fan_collector] followers/following取得失敗、前回値を維持しスキップ", flush=True)
        return []

    prev = _load_snapshot(account)
    prev_followers = set(prev.get("followers", []))
    ts = datetime.now().isoformat()
    new_followers = followers - prev_followers
    unfollowed = prev_followers - followers
    events = [{"type": "follow", "screen_name": s, "ts": ts} for s in new_followers]
    events += [{"type": "unfollow", "screen_name": s, "ts": ts} for s in unfollowed]

    _save_snapshot(account, followers, following)
    print(f"[fan_collector] followers={len(followers)} following={len(following)} "
          f"new={len(new_followers)} unfollowed={len(unfollowed)}", flush=True)
    return events


def collect_quote_events(account: str) -> list[dict]:
    """url:x.com/<account>/status を検索して引用RTをquoteイベントとして記録"""
    try:
        result = subprocess.run(
            [str(TWITTER_CLI), "search", f"url:x.com/{account}/status",
             "-n", str(QUOTE_SEARCH_N), "--json"],
            capture_output=True, text=True, timeout=30, env=_CLI_ENV,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return []
        data = json.loads(result.stdout)
        tweets = data.get("data", data) if isinstance(data, dict) else data
    except Exception as e:
        print(f"[fan_collector] quote検索エラー: {e}", flush=True)
        return []

    try:
        seen = set(json.loads(_quote_seen_file(account).read_text()).get("seen_ids", []))
    except Exception:
        seen = set()

    ts = datetime.now().isoformat()
    events = []
    new_seen = set(seen)
    for t in tweets:
        tweet_id = str(t.get("id", ""))
        author = t.get("author", {})
        screen_name = author.get("screenName") or author.get("screen_name") or ""
        if not tweet_id or not screen_name or tweet_id in seen or screen_name.lower() == account.lower():
            continue
        events.append({"type": "quote", "screen_name": screen_name, "tweet_id": tweet_id, "ts": ts})
        new_seen.add(tweet_id)

    if events:
        STACKCHAN_DIR.mkdir(parents=True, exist_ok=True)
        _quote_seen_file(account).write_text(json.dumps({"seen_ids": list(new_seen)}, ensure_ascii=False))
    print(f"[fan_collector] quote新規: {len(events)}件", flush=True)
    return events


def main() -> None:
    account = sys.argv[1] if len(sys.argv) > 1 else "becky_exists"
    _inject_cdp_cookies()
    events = collect_follow_events(account) + collect_quote_events(account)
    _append_events(account, events)
    print(f"[fan_collector] {account}: {len(events)}件追記 → {_events_file(account)}", flush=True)


if __name__ == "__main__":
    main()
