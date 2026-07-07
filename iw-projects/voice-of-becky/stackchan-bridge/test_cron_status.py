#!/usr/bin/env python3
"""cron_status.py のコアロジック自己チェック。`python3 test_cron_status.py` で走る。"""
from datetime import datetime

import cron_status as cs


def test_expand():
    assert cs.expand_field("*/30", 0, 59) == {0, 30}
    assert cs.expand_field("9,17,21", 0, 23) == {9, 17, 21}
    assert cs.expand_field("8-10", 0, 23) == {8, 9, 10}
    assert cs.expand_field("*", 0, 6) == {0, 1, 2, 3, 4, 5, 6}


def test_humanize():
    assert cs.humanize("7", "21", "*", "*", "0") == "毎週日曜 21:07"
    assert cs.humanize("*/30", "*", "*", "*", "*") == "30分毎"
    assert cs.humanize("0", "7", "*", "*", "*") == "毎日 7:00"
    assert cs.humanize("0", "9,17,21", "*", "*", "*") == "毎日 9,17,21時"
    assert cs.humanize("30", "8,13,19", "*", "*", "*") == "毎日 8,13,19時30分"
    assert cs.humanize("0", "*", "*", "*", "*") == "毎時 0分"
    assert cs.humanize("30", "19", "*", "*", "4") == "毎週木曜 19:30"


def test_fire():
    # 毎日 7:40。基準 2026-07-07 10:00 → prev=今日7:40, next=明日7:40
    sched = cs.parse_schedule("40", "7", "*", "*", "*")
    now = datetime(2026, 7, 7, 10, 0)
    assert cs.prev_fire(sched, now) == datetime(2026, 7, 7, 7, 40)
    assert cs.next_fire(sched, now) == datetime(2026, 7, 8, 7, 40)
    # 30分毎の間隔は 30 分
    s2 = cs.parse_schedule("*/30", "*", "*", "*", "*")
    assert cs.fire_interval_min(s2, now) == 30


def test_dow_sunday():
    # cron dow 0 と 7 は日曜。2026-07-05 は日曜。
    sched = cs.parse_schedule("0", "21", "*", "*", "0")
    assert cs.matches(sched, datetime(2026, 7, 5, 21, 0)) is True
    assert cs.matches(sched, datetime(2026, 7, 6, 21, 0)) is False  # 月曜


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
    print("all passed")
