#!/usr/bin/env python3
"""delivery_planner.py — 配達リズムの生体化(2026-08-14 反応駆動ルーティング新設)。

「毎日皆勤・固定時刻・同一尺」という8/5配信ゼロ事件の量産シグナルを構造ごと消すため、
その日の投稿本数と時刻を mood.json から機械的に決める(演出の偽乱数ではなく実際の内部状態)。
本数(0〜3)は energy/curiosity の平均、時刻は3つの窓内での分単位完全ランダム。

何を投稿するか(Shorts/Xテキスト/diary/スキップ)はここでは決めない——それは各スロットが
発火した時に auto_news_shorts.py 側の編集会議(editorial_meeting)が判定する。ここは
「今日は何回チャンスを作るか」だけを決める。

cron: 30 6 * * * (毎朝、当日ぶんを1回だけ生成)
Usage: python3 delivery_planner.py [--dry-run] [--selftest]
"""
import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

MOOD_JSON = Path.home() / ".stackchan" / "becky_mood.json"
PLAN_JSON = Path.home() / ".stackchan" / "delivery_plan.json"

# 朝/昼/夕の3窓(HH:MM)。countがこれ未満なら先頭から使う。
WINDOWS = [("09:00", "11:00"), ("11:30", "13:30"), ("16:00", "19:00")]

# ponytail: 調査フェーズ中の上限(2026-08-17〜、可視性制限の原因切り分け中は1本/日に絞る)。
# 反応が読めるようになったら len(WINDOWS) に戻す(=実質クランプなし)。
INVESTIGATION_PHASE_MAX_COUNT = 1


def decide_count(mood: dict) -> int:
    """energy/curiosityの平均で0〜3本を決める。energy低い日は本当に0本になる。"""
    score = (mood.get("energy", 0.6) + mood.get("curiosity", 0.6)) / 2
    if score < 0.35:
        return 0
    if score < 0.55:
        return 1
    if score < 0.75:
        return 2
    return 3


def _random_time_in_window(window: tuple[str, str]) -> str:
    start_h, start_m = map(int, window[0].split(":"))
    end_h, end_m = map(int, window[1].split(":"))
    start_total = start_h * 60 + start_m
    end_total = end_h * 60 + end_m
    minute = random.randint(start_total, max(start_total, end_total - 1))
    return f"{minute // 60:02d}:{minute % 60:02d}"


def build_slots(count: int, date: str | None = None) -> list[str]:
    """count本ぶんのISOタイムスタンプ(その日の日付+窓内ランダム分)を返す。countは0〜3にクランプ。"""
    count = max(0, min(len(WINDOWS), count))
    date = date or datetime.now().strftime("%Y-%m-%d")
    times = [_random_time_in_window(w) for w in WINDOWS[:count]]
    return [f"{date}T{t}:00" for t in sorted(times)]


def load_mood() -> dict:
    """mood.json欠損/破損時は energy/curiosity=0.5(中庸プラン)にフォールバックする(他cronと同じfail-softパターン)。"""
    try:
        return json.loads(MOOD_JSON.read_text()) if MOOD_JSON.exists() else {"energy": 0.5, "curiosity": 0.5}
    except Exception as e:
        print(f"[delivery-planner] mood.json読み込み失敗、中庸プランにフォールバック: {e}", flush=True)
        return {"energy": 0.5, "curiosity": 0.5}


def main() -> None:
    dry = "--dry-run" in sys.argv
    mood = load_mood()
    count = min(decide_count(mood), INVESTIGATION_PHASE_MAX_COUNT)
    slots = build_slots(count)
    print(f"[delivery-planner] energy={mood.get('energy', '—')} curiosity={mood.get('curiosity', '—')} "
          f"→ 本数={count} 時刻={slots}", flush=True)
    if dry:
        print("[delivery-planner] --dry-run のため書き込みなし", flush=True)
        return
    plan = {"date": datetime.now().strftime("%Y-%m-%d"),
            "slots": [{"time": t, "fired": False} for t in slots]}
    PLAN_JSON.parent.mkdir(parents=True, exist_ok=True)
    # atomic write: write_text()はtruncate→書き込みなので、同時刻に走るdispatcherが
    # 空/欠損ファイルを掴む競合があった(2026-08-19実測、JSONDecodeError)。tmp→os.replaceで解消
    tmp = PLAN_JSON.with_suffix(".tmp")
    tmp.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(PLAN_JSON)
    print(f"[delivery-planner] 書き込み完了: {PLAN_JSON}", flush=True)


def _selftest() -> None:
    assert decide_count({"energy": 0.2, "curiosity": 0.2}) == 0
    assert decide_count({"energy": 0.5, "curiosity": 0.5}) == 1
    assert decide_count({"energy": 0.65, "curiosity": 0.65}) == 2
    assert decide_count({"energy": 0.9, "curiosity": 0.9}) == 3
    assert decide_count({}) == 2  # デフォルト0.6/0.6 → score0.6

    slots0 = build_slots(0, date="2026-08-17")
    assert slots0 == []
    slots3 = build_slots(3, date="2026-08-17")
    assert len(slots3) == 3 and slots3 == sorted(slots3)
    for t, (lo, hi) in zip(sorted(slots3), WINDOWS):
        hhmm = t.split("T")[1][:5]
        assert lo <= hhmm < hi, (t, lo, hi)
    assert len(build_slots(99)) == len(WINDOWS)  # countは窓の数(3)でクランプされる

    # 調査フェーズ中クランプ: energy/curiosity高くても1本を超えない
    assert min(decide_count({"energy": 0.9, "curiosity": 0.9}), INVESTIGATION_PHASE_MAX_COUNT) == 1
    # 0本の日は0本のまま(クランプで底上げしない)
    assert min(decide_count({"energy": 0.2, "curiosity": 0.2}), INVESTIGATION_PHASE_MAX_COUNT) == 0
    print("delivery_planner self check OK", flush=True)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
