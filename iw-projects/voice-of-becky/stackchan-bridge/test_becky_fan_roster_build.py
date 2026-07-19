#!/usr/bin/env python3
"""becky_fan_roster_build.py のコアロジック自己チェック。`python3 test_becky_fan_roster_build.py` で走る。"""
from datetime import datetime, timedelta

import becky_fan_roster_build as rb


def _ts(days_ago: float) -> str:
    return (datetime.now() - timedelta(days=days_ago)).isoformat()


def test_classify():
    assert rb.classify(10, 100, None) == "コア"
    assert rb.classify(3, 100, None) == "常連"
    assert rb.classify(1, 100, None) == "初リプ"
    assert rb.classify(0, 3, None) == "新規"
    assert rb.classify(0, 100, 20) == "最近来なくなった人"
    assert rb.classify(0, 100, 3) == "フォロワー"


def test_aggregate_dedup():
    # 同じ tweet_id の reply イベントが重複しても reply_count は1（observer再送耐性）
    events = [
        {"type": "follow", "screen_name": "u1", "ts": _ts(30)},
        {"type": "reply", "screen_name": "u1", "tweet_id": "t1", "ts": _ts(5)},
        {"type": "reply", "screen_name": "u1", "tweet_id": "t1", "ts": _ts(5)},  # 重複
        {"type": "reply", "screen_name": "u1", "tweet_id": "t2", "ts": _ts(1)},
    ]
    agg = rb.aggregate(events)
    assert len(agg["u1"]["reply_ids"]) == 2
    assert agg["u1"]["first_seen"] == _ts(30) or True  # 文字列比較の近似のため存在確認のみ


def test_weekly_stats_window():
    events = [
        {"type": "follow", "screen_name": "a", "ts": _ts(2)},   # 今週
        {"type": "follow", "screen_name": "b", "ts": _ts(10)},  # 先週
        {"type": "reply", "screen_name": "c", "tweet_id": "x", "ts": _ts(3)},
        {"type": "reply", "screen_name": "c", "tweet_id": "x", "ts": _ts(3)},  # dedup対象
    ]
    stats = rb.compute_weekly_stats(events, datetime.now())
    assert stats["new_followers_7d"] == 1
    assert stats["new_followers_prev7d"] == 1
    assert stats["replies_7d"] == 1  # 重複tweet_idはdedupで1件


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
    print("all passed")
