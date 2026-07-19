#!/usr/bin/env python3
"""
becky_fan_roster_build.py — fan_events_<account>.jsonl からロースター再構築（Backstage Phase 0）

becky_fan_collector.py の後にcronで実行。イベント全件+スナップショットから
1ユーザー1レコード（reply_count/quote_count/is_following_back/tenure_days/category）+
週次サマリーを作り、iw-projects/beckyexists/fan_roster_<account>.json に書く（絶対パス、
書き込み失敗時は前回値維持、platform_scraper.py の規約に倣う）。

使い方:
  python3 becky_fan_roster_build.py [account]   # デフォルト: becky_exists
"""
import json
import sys
from datetime import datetime
from pathlib import Path

STACKCHAN_DIR = Path.home() / ".stackchan"
OUTPUT_DIR = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists")

# 分類しきい値（ルールベース、LLM不使用）
CORE_REPLY_THRESHOLD = 10
REGULAR_REPLY_THRESHOLD = 3
NEW_TENURE_DAYS = 7
STALE_REACTION_DAYS = 14


def _events_file(account: str) -> Path:
    return STACKCHAN_DIR / f"fan_events_{account}.jsonl"


def _snapshot_file(account: str) -> Path:
    return STACKCHAN_DIR / f"fan_snapshot_{account}.json"


def load_events(account: str) -> list[dict]:
    events = []
    path = _events_file(account)
    if not path.exists():
        return events
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except Exception:
            continue  # ponytail: 壊れた1行で全体を落とさない
    return events


def load_following_set(account: str) -> set[str]:
    try:
        return set(json.loads(_snapshot_file(account).read_text()).get("following", []))
    except Exception:
        return set()


def aggregate(events: list[dict]) -> dict[str, dict]:
    """screen_name -> {first_seen, last_reaction, reply_ids, quote_ids}"""
    users: dict[str, dict] = {}
    for e in events:
        screen_name = e.get("screen_name")
        ts = e.get("ts")
        etype = e.get("type")
        if not screen_name or not ts:
            continue
        u = users.setdefault(screen_name, {
            "first_seen": ts, "last_reaction": None,
            "reply_ids": set(), "quote_ids": set(),
        })
        if ts < u["first_seen"]:
            u["first_seen"] = ts
        if etype in ("reply", "quote"):
            if ts > (u["last_reaction"] or ""):
                u["last_reaction"] = ts
            tweet_id = e.get("tweet_id")
            if tweet_id:
                u[f"{etype}_ids"].add(tweet_id)
    return users


def classify(reply_count: int, tenure_days: int | None, days_since_reaction: float | None) -> str:
    if reply_count >= CORE_REPLY_THRESHOLD:
        return "コア"
    if reply_count >= REGULAR_REPLY_THRESHOLD:
        return "常連"
    if reply_count == 1:
        return "初リプ"
    if tenure_days is not None and tenure_days < NEW_TENURE_DAYS:
        return "新規"
    if days_since_reaction is not None and days_since_reaction >= STALE_REACTION_DAYS:
        return "最近来なくなった人"
    return "フォロワー"


def compute_weekly_stats(events: list[dict], now: datetime) -> dict:
    """直近7日 vs その前7日（先週比用）。reply/quoteはtweet_id単位でdedupしてカウント。"""
    def _age_days(ts: str) -> float | None:
        try:
            return (now - datetime.fromisoformat(ts)).total_seconds() / 86400
        except Exception:
            return None

    def _count(etype: str, lo: float, hi: float, dedup: bool) -> int:
        seen, n = set(), 0
        for e in events:
            if e.get("type") != etype:
                continue
            age = _age_days(e.get("ts", ""))
            if age is None or not (lo <= age < hi):
                continue
            if dedup:
                key = e.get("tweet_id")
                if key in seen:
                    continue
                seen.add(key)
            n += 1
        return n

    return {
        "new_followers_7d": _count("follow", 0, 7, dedup=False),
        "new_followers_prev7d": _count("follow", 7, 14, dedup=False),
        "replies_7d": _count("reply", 0, 7, dedup=True),
        "replies_prev7d": _count("reply", 7, 14, dedup=True),
        "quotes_7d": _count("quote", 0, 7, dedup=True),
        "quotes_prev7d": _count("quote", 7, 14, dedup=True),
    }


def build_roster(account: str) -> dict:
    events = load_events(account)
    following = load_following_set(account)
    agg = aggregate(events)
    now = datetime.now()

    roster = []
    for screen_name, u in agg.items():
        try:
            tenure_days = (now - datetime.fromisoformat(u["first_seen"])).days
        except Exception:
            tenure_days = None
        days_since_reaction = None
        if u["last_reaction"]:
            try:
                days_since_reaction = (now - datetime.fromisoformat(u["last_reaction"])).days
            except Exception:
                pass
        reply_count = len(u["reply_ids"])
        quote_count = len(u["quote_ids"])
        roster.append({
            "screen_name": screen_name,
            "first_seen": u["first_seen"],
            "last_reaction": u["last_reaction"],
            "reply_count": reply_count,
            "quote_count": quote_count,
            "is_following_back": screen_name in following,
            "tenure_days": tenure_days,
            "category": classify(reply_count, tenure_days, days_since_reaction),
        })

    roster.sort(key=lambda r: r["last_reaction"] or r["first_seen"], reverse=True)
    return {
        "account": account,
        "generated_at": now.isoformat(),
        "weekly": compute_weekly_stats(events, now),
        "fans": roster,
    }


def main() -> None:
    account = sys.argv[1] if len(sys.argv) > 1 else "becky_exists"
    try:
        data = build_roster(account)
    except Exception as e:
        print(f"[fan_roster] 集計失敗（前回値維持）: {e}", flush=True)
        return
    out_path = OUTPUT_DIR / f"fan_roster_{account}.json"
    try:
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"[fan_roster] {account}: {len(data['fans'])}人 → {out_path}", flush=True)
    except Exception as e:
        print(f"[fan_roster] 書き込み失敗（前回値維持）: {e}", flush=True)


if __name__ == "__main__":
    main()
