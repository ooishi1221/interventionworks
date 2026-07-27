#!/usr/bin/env python3
"""test_night_pipeline.py — night_pipeline.py の純粋関数の自己チェック(assertベース)。

実行: python3 scripts/test_night_pipeline.py
"""
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from night_pipeline import (JST, append_readme_row, build_description, lane_for,
                             prev_episode_url, publish_at_for, read_constant,
                             select_queue_row, tts_failure_count)


def test_lane_for():
    assert lane_for(1) == "### 本編レーン"  # 火
    assert lane_for(4) == "### 企画回レーン"  # 金
    try:
        lane_for(2)
        assert False, "水曜は例外になるべき"
    except ValueError:
        pass


def test_publish_at_for():
    tue = dt.datetime(2026, 7, 21, 3, 0, tzinfo=JST)  # 火曜3:00
    assert publish_at_for(tue) == dt.datetime(2026, 7, 22, 19, 0, tzinfo=JST)  # 翌水19:00
    fri = dt.datetime(2026, 7, 24, 3, 0, tzinfo=JST)  # 金曜3:00
    assert publish_at_for(fri) == dt.datetime(2026, 7, 25, 19, 0, tzinfo=JST)  # 翌土19:00


MD_SAMPLE = """## キュー

### 本編レーン
| # | 企画 | GOAL | 状態 |
|---|---|---|---|
| M1 | 企画A | ゴールA | EP.008 収録済み（2026-07-21） |
| M2 | 企画B | ゴールB | |

### 企画回レーン
| # | 企画 | GOAL | 狙い |
|---|---|---|---|
| K2 | 一撃死縛り | 1デス即終了 | 緊張感MAX |
"""


def test_select_queue_row_skips_done():
    row = select_queue_row(MD_SAMPLE, "### 本編レーン")
    assert row is not None and row["id"] == "M2", row

    row2 = select_queue_row(MD_SAMPLE, "### 企画回レーン")
    assert row2 is not None and row2["id"] == "K2", row2

    # 全行消化済みなら None
    all_done = MD_SAMPLE.replace("| M2 | 企画B | ゴールB | |",
                                  "| M2 | 企画B | ゴールB | EP.009 収録済み（2026-07-22） |")
    assert select_queue_row(all_done, "### 本編レーン") is None


def test_tts_failure_count():
    log_ok = "\n".join(f"[tts] turn {i} 成功" for i in range(5))
    assert tts_failure_count(log_ok) == 0
    log_2fail = log_ok + "\n[tts] turn 6 失敗、スキップ: timeout\n[tts] turn 7 失敗、スキップ: timeout"
    assert tts_failure_count(log_2fail) == 2  # 2件=まだpass(<3)
    log_3fail = log_2fail + "\n[tts] turn 8 失敗、スキップ: timeout"
    assert tts_failure_count(log_3fail) == 3  # 3件=fail


def test_read_constant():
    src = 'EP_NUM = "008"\nEP_TITLE = "6度目の鉄 — 今度こそ dig_down"\n'
    assert read_constant(src, "EP_NUM") == "008"
    assert read_constant(src, "EP_TITLE") == "6度目の鉄 — 今度こそ dig_down"
    try:
        read_constant(src, "NOT_EXIST")
        assert False, "存在しない定数は例外になるべき"
    except ValueError:
        pass


def test_append_readme_row():
    readme = "| EP | タイトル | URL | 備考 |\n|---|---|---|---|\n| 007 | 前回 | url7 | note7 |\n\nShorts: ...\n"
    out = append_readme_row(readme, "| 008 | 今回 | url8 | note8 |\n")
    lines = out.splitlines()
    idx = lines.index("| 007 | 前回 | url7 | note7 |")
    assert lines[idx + 1] == "| 008 | 今回 | url8 | note8 |", out


def test_prev_episode_url():
    readme = "| EP | タイトル | URL | 備考 |\n|---|---|---|---|\n| 007 | 前回 | url7 | note7 |\n"
    assert prev_episode_url(readme) == "url7"
    assert prev_episode_url("no table here") is None


def test_build_description():
    readme = "| EP | タイトル | URL | 備考 |\n|---|---|---|---|\n| 007 | 前回 | url7 | note7 |\n"
    desc = build_description("008", {"highlight": "鉄まで届かず。"}, readme)
    assert "第008回" in desc
    assert "鉄まで届かず。" in desc
    assert "前回 EP.007: url7" in desc
    assert "初回 EP.001: https://www.youtube.com/watch?v=NIf3LvNo6io" in desc
    assert "#マインクラフト #Minecraft #マイクラ" in desc
    assert "#AI #BECKYCRAFT" not in desc

    # README にエピソード行が無ければ「前回」行を省略(fail-soft)
    desc_no_prev = build_description("001", {"highlight": ""}, "no table")
    assert "前回" not in desc_no_prev


if __name__ == "__main__":
    test_lane_for()
    test_publish_at_for()
    test_select_queue_row_skips_done()
    test_tts_failure_count()
    test_read_constant()
    test_append_readme_row()
    test_prev_episode_url()
    test_build_description()
    print("OK: all night_pipeline self-checks passed")
