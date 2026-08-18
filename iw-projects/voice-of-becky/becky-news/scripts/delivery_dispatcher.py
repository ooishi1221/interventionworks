#!/usr/bin/env python3
"""delivery_dispatcher.py — 配達リズムの生体化(2026-08-14 反応駆動ルーティング新設)、実行係。

delivery_planner.py が朝6:30に書いた ~/.stackchan/delivery_plan.json を見て、
時刻が来た未発火スロットを見つけたら auto_news_shorts.py を1回起動する。
何を投稿するか(Shorts/Xテキスト/diary/スキップ)は auto_news_shorts.py 側の編集会議が決める
——ここは「今この瞬間、発火すべきスロットがあるか」だけを見る。

cron: */10 * * * *
Usage: python3 delivery_dispatcher.py [--dry-run] [--selftest]
"""
import fcntl
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PLAN_JSON = Path.home() / ".stackchan" / "delivery_plan.json"
LOCK_FILE = Path.home() / ".stackchan" / "delivery_dispatcher.lock"
AUTO_NEWS_SHORTS = Path(__file__).resolve().parent / "auto_news_shorts.py"


def due_slots(plan: dict, now: datetime) -> list[int]:
    """今日ぶんのplanの中で、時刻が来ていてまだfireしていないスロットのindexを返す。
    日付が違う(古いplanが残っている等)場合は何も発火しない。"""
    if plan.get("date") != now.strftime("%Y-%m-%d"):
        return []
    out = []
    for i, slot in enumerate(plan.get("slots", [])):
        if slot.get("fired"):
            continue
        if datetime.fromisoformat(slot["time"]) <= now:
            out.append(i)
    return out


def main() -> None:
    dry = "--dry-run" in sys.argv
    if not PLAN_JSON.exists():
        print("[delivery-dispatcher] delivery_plan.jsonなし、スキップ", flush=True)
        return

    # ponytail: 窓ギャップ最短30分だと前tickのauto_news_shorts(TTS+レンダーで数分かかる)と
    # 次tick(10分毎)が並走しうる。fired更新の競合を防ぐため、走行中なら当tickは何もせず抜ける
    # ——スロットはfiredにしない(次の10分tickが自動的にリトライする、スロットを失わない)。
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    lock_f = open(LOCK_FILE, "a+")
    try:
        fcntl.flock(lock_f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("[delivery-dispatcher] 前回実行がまだ走行中、このtickはスキップ(次tickでリトライ)", flush=True)
        lock_f.close()
        return

    try:
        # planner側は2026-08-19にatomic write化したが、書き込み直後の稀な競合や
        # 手動編集中の一瞬を掴んでも次tick(10分後)が自動リトライするようfail-softにする
        try:
            plan = json.loads(PLAN_JSON.read_text())
        except json.JSONDecodeError as e:
            print(f"[delivery-dispatcher] plan.json読み取り失敗、次tickでリトライ: {e}", flush=True)
            return
        now = datetime.now()
        idxs = due_slots(plan, now)
        if not idxs:
            print("[delivery-dispatcher] 発火対象なし", flush=True)
            return

        for i in idxs:
            print(f"[delivery-dispatcher] スロット発火: {plan['slots'][i]['time']}", flush=True)
            if dry:
                continue
            plan["slots"][i]["fired"] = True
            PLAN_JSON.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
            subprocess.run(["python3", str(AUTO_NEWS_SHORTS)], check=False)
    finally:
        fcntl.flock(lock_f, fcntl.LOCK_UN)
        lock_f.close()


def _selftest() -> None:
    now = datetime(2026, 8, 17, 10, 0, 0)
    plan = {"date": "2026-08-17", "slots": [
        {"time": "2026-08-17T09:30:00", "fired": False},   # 過去→対象
        {"time": "2026-08-17T09:45:00", "fired": True},    # 発火済み→対象外
        {"time": "2026-08-17T10:00:00", "fired": False},   # ちょうど今→対象
        {"time": "2026-08-17T10:15:00", "fired": False},   # 未来→対象外
    ]}
    assert due_slots(plan, now) == [0, 2]
    assert due_slots({"date": "2026-08-16", "slots": plan["slots"]}, now) == []  # 古いplanは無視
    assert due_slots({"slots": []}, now) == []
    print("delivery_dispatcher self check OK", flush=True)


def _selftest_lock() -> None:
    """並走ガードの回帰テスト。flockはOSの機構としてopen file description単位で効くため、
    別プロセスを2つ立てるのと、同一プロセス内で別fdを2つ開くのは同じ挙動になる(BSD flock仕様)。
    ロック保持中はスロットが発火しない/解放後は正しく発火することを確認する。"""
    import tempfile
    global PLAN_JSON, LOCK_FILE, AUTO_NEWS_SHORTS
    orig_plan, orig_lock, orig_script = PLAN_JSON, LOCK_FILE, AUTO_NEWS_SHORTS
    with tempfile.TemporaryDirectory() as d:
        PLAN_JSON = Path(d) / "delivery_plan.json"
        LOCK_FILE = Path(d) / "delivery_dispatcher.lock"
        AUTO_NEWS_SHORTS = Path(d) / "dummy.py"
        AUTO_NEWS_SHORTS.write_text("")  # 何もしないダミー(実パイプラインは叩かない)
        today = datetime.now().strftime("%Y-%m-%d")
        due_time = datetime.now().replace(microsecond=0).isoformat()
        PLAN_JSON.write_text(json.dumps({"date": today, "slots": [{"time": due_time, "fired": False}]}))

        # 別プロセスがロックを保持中を模して先取り
        holder = open(LOCK_FILE, "a+")
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            sys.argv = ["delivery_dispatcher.py"]
            main()
            got = json.loads(PLAN_JSON.read_text())
            assert got["slots"][0]["fired"] is False, "ロック保持中なのにスロットが発火/消費された"
        finally:
            fcntl.flock(holder, fcntl.LOCK_UN)
            holder.close()

        # ロック解放後は同じスロットが失われずに正しく発火する
        main()
        got2 = json.loads(PLAN_JSON.read_text())
        assert got2["slots"][0]["fired"] is True, "ロック解放後にスロットが発火しなかった(スロットを失った)"
    PLAN_JSON, LOCK_FILE, AUTO_NEWS_SHORTS = orig_plan, orig_lock, orig_script
    print("delivery_dispatcher lock self check OK", flush=True)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        _selftest_lock()
    else:
        main()
