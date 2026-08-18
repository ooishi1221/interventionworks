#!/usr/bin/env python3
"""
mugi_watch.py — @mugi_AI_Art の技法解説っぽい新着ポストを検知してストックへ積む

技法そのもの(スフマート＝絵画技法、ネオポップ等)は誰のものでもないが、彼女固有の
文章表現をそのまま複製しないよう、ストックには LLM でパラフレーズした要約だけを残す。
検知→ストックまでが自動、technique_stock の origin_check 欄（一般技法か彼女固有の
構成か）は人間判断待ちの空欄のまま。becky_image.py 側も origin_check 未記入のエントリ
は使わない（2段階のうち2段目は必ず人間判断を挟む設計）。

前提: search 系(twitter-cli)はClientTransaction生成が壊れて404
(docs/becky-context/reference_twitter_cli_status.md)。user-posts は無事なのでこれで足りる
——プロフィール直接スクレイピング(Playwright DOM操作)は不要と実機確認済み(2026-08-18)。

Usage:
    python3 mugi_watch.py            # 検知→ストック追記
    python3 mugi_watch.py --dry-run  # 検知結果を表示するだけ、ストックは書かない
"""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

TWITTER_CLI = Path.home() / ".local" / "pipx" / "venvs" / "twitter-cli" / "bin" / "twitter"
STACKCHAN_DIR = Path.home() / ".stackchan"
SEEN_FILE = STACKCHAN_DIR / "mugi_watch_seen.json"
STOCK_FILE = Path(__file__).parent / "mugi_technique_stock.json"
ACCOUNT = "mugi_AI_Art"
FETCH_N = 50  # 2026-08-18実測: 30だと直近の投稿ラッシュ(RT含む)で技法解説ポストが窓から押し出された
# 技法解説っぽい投稿のキーワード判定(過去の実例=ネオポップ/蒔絵/スフマート解説で共通する語)
TECHNIQUE_KEYWORDS = ("術", "プロンプト", "解説", "技法", "表現")


def _inject_cdp_cookies() -> dict:
    """becky_fan_collector.py と同じ流儀(専用Chrome CDP:9223、contexts()[0]再利用)。
    cookie注入済みのenvを返す(失敗時は素のenv、呼び出し側はbrowser cookie抽出にフォールバック)。"""
    env = dict(os.environ)
    try:
        import chrome_cdp
        alive, started_by_me = chrome_cdp.ensure_running()
        if not alive:
            print("[mugi_watch] Chrome起動タイムアウト、browser抽出にフォールバック", flush=True)
            return env
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://localhost:9223")
            cookies = {c["name"]: c["value"] for c in browser.contexts[0].cookies("https://x.com")}
        if cookies.get("auth_token") and cookies.get("ct0"):
            env["TWITTER_AUTH_TOKEN"] = cookies["auth_token"]
            env["TWITTER_CT0"] = cookies["ct0"]
        if started_by_me:
            chrome_cdp.stop()
    except Exception as e:
        print(f"[mugi_watch] CDP cookie取得失敗、browser抽出にフォールバック: {e}", flush=True)
    return env


def fetch_posts(env: dict) -> list[dict]:
    try:
        r = subprocess.run(
            [str(TWITTER_CLI), "user-posts", ACCOUNT, "--json", "-n", str(FETCH_N)],
            capture_output=True, text=True, timeout=30, env=env,
        )
        if r.returncode != 0 or not r.stdout.strip():
            print(f"[mugi_watch] user-posts失敗: {r.stderr[:150]}", flush=True)
            return []
        data = json.loads(r.stdout)
        return data.get("data", [])
    except Exception as e:
        print(f"[mugi_watch] user-posts エラー: {e}", flush=True)
        return []


def is_technique_post(tweet: dict) -> bool:
    """本人の投稿(RTでない)かつ技法紹介っぽいキーワードを含むか。"""
    if tweet.get("author", {}).get("screenName") != ACCOUNT or tweet.get("isRetweet"):
        return False
    return any(k in tweet.get("text", "") for k in TECHNIQUE_KEYWORDS)


def _load_seen() -> set[str]:
    try:
        return set(json.loads(SEEN_FILE.read_text()).get("seen_ids", []))
    except Exception:
        return set()


def _save_seen(seen: set[str]) -> None:
    STACKCHAN_DIR.mkdir(parents=True, exist_ok=True)
    SEEN_FILE.write_text(json.dumps({"seen_ids": list(seen)}, ensure_ascii=False))


def extract_technique_name(text: str) -> str:
    """ハッシュタグ優先(例: #極上の芸術に昇華させるスフマート)、なければ本文の最初の一文。"""
    m = re.search(r"#([^\s#]{2,20})", text)
    if m:
        return m.group(1)
    first_line = text.strip().splitlines()[0]
    return re.split(r"[。、\s]", first_line, maxsplit=1)[0][:30]


def summarize(text: str) -> str:
    """LLMで2〜3行に要約・パラフレーズする(本人の言い回しをそのまま複製しないため)。
    失敗時は要約せず、origin_check運用時に人間がURLから直接読む前提のプレースホルダにする
    (fail-soft: 生の本文をそのままstockに流用するくらいなら空欄にする=線引き優先)。"""
    try:
        from becky_llm import call_llm
        prompt = (
            "以下は画像生成AIの技法解説ポストです。技法の要点だけを、"
            "元の言い回しをそのまま使わず自分の言葉で2〜3行に要約してください。"
            "作者名や販売リンク・宣伝文句には触れず、技法の中身(何をどうするか)だけを"
            "説明してください。\n\n" + text
        )
        summary = call_llm(prompt, max_tokens=200)
        if summary:
            return summary.strip()
    except Exception as e:
        print(f"[mugi_watch] 要約失敗: {e}", flush=True)
    return "(要約失敗: origin_check記入時に元URLから手動で技法要点を書くこと)"


def build_entry(tweet: dict) -> dict:
    text = tweet.get("text", "")
    return {
        "tweet_id": tweet["id"],
        "url": f"https://x.com/{ACCOUNT}/status/{tweet['id']}",
        "date": tweet.get("createdAtLocal", ""),
        "technique_name": extract_technique_name(text),
        "summary": summarize(text),
        "origin_check": "",  # 人間(orベッキー)が後で判断: 一般技法か彼女固有の構成か。空欄のうちは使用不可
        "used": False,
    }


def run(dry_run: bool = False) -> list[dict]:
    env = _inject_cdp_cookies()
    posts = fetch_posts(env)
    seen = _load_seen()
    candidates = [t for t in posts if is_technique_post(t) and t["id"] not in seen]
    print(f"[mugi_watch] 取得{len(posts)}件 / 技法候補{len(candidates)}件(新規)", flush=True)

    if not candidates:
        return []

    new_entries = [build_entry(t) for t in candidates]
    if not dry_run:
        stock = json.loads(STOCK_FILE.read_text()) if STOCK_FILE.exists() else []
        stock.extend(new_entries)
        STOCK_FILE.write_text(json.dumps(stock, ensure_ascii=False, indent=2))
        _save_seen(seen | {t["id"] for t in candidates})
        print(f"[mugi_watch] ストック追記: {len(new_entries)}件 → {STOCK_FILE}", flush=True)
    else:
        for e in new_entries:
            print(f"[mugi_watch][DRY] {e['technique_name']}: {e['url']}", flush=True)
    return new_entries


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="ストックを書かず検知結果だけ表示")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
