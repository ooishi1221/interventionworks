#!/usr/bin/env python3
"""cron_status.py のコアロジック自己チェック。`python3 test_cron_status.py` で走る。"""
import json
import os
import tempfile
import time
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


def test_autonomy_stale():
    with tempfile.TemporaryDirectory() as d:
        log_path = os.path.join(d, "observer_sent_log.jsonl")
        old_ts = time.time() - 4 * 86400  # 4日前（閾値3日を超える）
        with open(log_path, "w") as f:
            f.write(json.dumps({"topic": "scheduled:evening", "ts": time.time()}) + "\n")
            f.write(json.dumps({"topic": "ai_news_briefing", "ts": time.time()}) + "\n")
            f.write(json.dumps({"topic": "Voice of Becky", "ts": old_ts}) + "\n")

        # scheduled:/ai_news_briefingは除外され、speak_decisionの4日前だけが拾われる
        assert cs._last_speak_decision_ts(log_path) == old_ts

        todo_path = os.path.join(d, "becky_todo.txt")
        with open(todo_path, "w") as f:
            f.write("x\n")
        os.utime(todo_path, (old_ts - 4 * 86400, old_ts - 4 * 86400))  # 8日前（閾値7日を超える）

        jobs = cs.autonomy_stale_jobs(datetime.now(), log_path=log_path, todo_path=todo_path)
        names = {j["name"] for j in jobs}
        assert names == {"speak_decision", "todo_consume"}
        assert all(j["status"] == "stale" for j in jobs)

        # 閾値内なら何も足されない
        fresh_log = os.path.join(d, "fresh.jsonl")
        with open(fresh_log, "w") as f:
            f.write(json.dumps({"topic": "Slight", "ts": time.time()}) + "\n")
        fresh_todo = os.path.join(d, "fresh_todo.txt")
        with open(fresh_todo, "w") as f:
            f.write("y\n")
        assert cs.autonomy_stale_jobs(datetime.now(), log_path=fresh_log, todo_path=fresh_todo) == []

        # ファイルが無ければNone/スキップ（例外にならない）
        assert cs._last_speak_decision_ts(os.path.join(d, "nope.jsonl")) is None
        assert cs.autonomy_stale_jobs(datetime.now(), log_path=os.path.join(d, "nope.jsonl"),
                                       todo_path=os.path.join(d, "nope_todo.txt")) == []


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
    print("all passed")
