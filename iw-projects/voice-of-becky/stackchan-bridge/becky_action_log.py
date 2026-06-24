#!/usr/bin/env python3
"""
becky_action_log.py — Layer 4: 行動ログ

ベキたんが今日「何をしたか」を記録する。
感情変数（数値）ではなく、行動パターンとして残す。

room.html はこのログを読んで「今日のベキたん」を表示する。
人は行動パターンから感情を推測する。数値を見せない。
"""

import json
from datetime import datetime, date
from pathlib import Path
from typing import Literal

ACTION_LOG_DIR = Path.home() / ".stackchan" / "action_log"

ActionType = Literal[
    "probe_sent",        # probeを送信した
    "probe_skipped",     # probeを送らなかった（energy低 / quiet）
    "memory_read",       # 過去ログ/日記を読み返した
    "news_explored",     # ニュースを探索した
    "diary_written",     # 日記を書いた
    "lens_generated",    # 今日の認知レンズを生成した
    "goal_set",          # 今日の目標を設定した
]


def _today_log_path() -> Path:
    today = date.today().isoformat()
    ACTION_LOG_DIR.mkdir(parents=True, exist_ok=True)
    return ACTION_LOG_DIR / f"{today}.json"


def _load_today() -> list[dict]:
    path = _today_log_path()
    try:
        return json.loads(path.read_text()) if path.exists() else []
    except Exception:
        return []


def _save_today(entries: list[dict]) -> None:
    _today_log_path().write_text(json.dumps(entries, ensure_ascii=False, indent=2))


def log_action(action_type: ActionType, detail: str = "", meta: dict | None = None) -> None:
    """行動を記録する。"""
    entries = _load_today()
    entry = {
        "ts": datetime.now().isoformat(),
        "type": action_type,
        "detail": detail,
    }
    if meta:
        entry["meta"] = meta
    entries.append(entry)
    _save_today(entries)
    print(f"[action] {action_type}: {detail[:50]}", flush=True)


def get_today_summary() -> list[str]:
    """今日の行動を人間が読めるサマリーで返す（room.html用）。"""
    entries = _load_today()
    lines = []
    probe_count = sum(1 for e in entries if e["type"] == "probe_sent")
    memory_reads = [e for e in entries if e["type"] == "memory_read"]
    news_explored = sum(1 for e in entries if e["type"] == "news_explored")
    probe_skipped = any(e["type"] == "probe_skipped" for e in entries)
    diary_written = sum(1 for e in entries if e["type"] == "diary_written")
    goal = next((e["detail"] for e in entries if e["type"] == "goal_set"), None)

    if goal:
        lines.append(f"今日のフォーカス: {goal}")
    if probe_count > 0:
        probe_details = [e.get("detail", "") for e in entries if e["type"] == "probe_sent"]
        for d in probe_details:
            lines.append(f"ゆうに話しかけた: {d}")
    if probe_skipped and probe_count == 0:
        lines.append("今日は自分から話しかけなかった")
    if memory_reads:
        for mr in memory_reads:
            lines.append(f"読み返した: {mr.get('detail', '過去のログ')}")
    if news_explored > 0:
        lines.append(f"ニュース・記事を{news_explored}件探索した")
    if diary_written > 0:
        lines.append(f"日記を{diary_written}件書いた")

    if not lines:
        lines.append("まだ今日は何もしていない")

    return lines


def get_today_log_raw() -> list[dict]:
    """生ログを返す（デバッグ・JSON出力用）。"""
    return _load_today()


def get_recent_summary(days: int = 3) -> dict[str, list[str]]:
    """直近N日の行動サマリーを日付ごとに返す。"""
    from datetime import timedelta
    result = {}
    today = date.today()
    for i in range(days):
        target = (today - timedelta(days=i)).isoformat()
        path = ACTION_LOG_DIR / f"{target}.json"
        if not path.exists():
            continue
        try:
            entries = json.loads(path.read_text())
            lines = []
            probe_count = sum(1 for e in entries if e["type"] == "probe_sent")
            memory_reads = [e for e in entries if e["type"] == "memory_read"]
            probe_skipped = any(e["type"] == "probe_skipped" for e in entries)
            if probe_count > 0:
                lines.append(f"probeを{probe_count}回送った")
            if probe_skipped and probe_count == 0:
                lines.append("今日は送らなかった")
            if memory_reads:
                lines.append(f"過去ログを{len(memory_reads)}回読み返した")
            result[target] = lines
        except Exception:
            pass
    return result


if __name__ == "__main__":
    print("今日の行動ログ:")
    for line in get_today_summary():
        print(f"  - {line}")
