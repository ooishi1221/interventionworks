#!/usr/bin/env python3
"""_append_history() の 0 vs 欠測(None) 判定 self-check
（ponytail: assert ベース、フレームワーク不要）

Usage: python3 test_platform_scraper_history.py
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import platform_scraper as ps


def _run(stats: dict, history_path: Path) -> dict:
    ps.HISTORY_OUTPUT = history_path
    ps._append_history(stats)
    return json.loads(history_path.read_text())["days"][-1]


def main():
    with tempfile.TemporaryDirectory() as d:
        history_path = Path(d) / "platform_history.json"

        # 1. x_analytics 取得成功 + impressions 0 → 0 のまま保存（None に潰さない）
        entry = _run({
            "x_analytics": {"total_impressions": 0, "total_likes": 0, "login_required": False},
        }, history_path)
        assert entry["x_imp_7d"] == 0, f"取得成功時の0がNoneに潰れた: {entry}"
        assert entry["x_likes_7d"] == 0, f"取得成功時の0がNoneに潰れた: {entry}"

        # 2. ログイン切れ（login_required=True）→ None
        entry = _run({
            "x_analytics": {"total_impressions": 0, "total_likes": 0, "login_required": True},
        }, history_path)
        assert entry["x_imp_7d"] is None, f"ログイン切れなのに数値が入った: {entry}"
        assert entry["x_likes_7d"] is None, f"ログイン切れなのに数値が入った: {entry}"

        # 3. スクレイプ例外（error キー）→ None
        entry = _run({
            "x_analytics": {"scraped_at": None, "error": "boom"},
        }, history_path)
        assert entry["x_imp_7d"] is None, f"例外時に数値が入った: {entry}"
        assert entry["x_likes_7d"] is None, f"例外時に数値が入った: {entry}"

        # 4. note_views が 0 → 従来通り None（累積系の挙動は変えていない）
        entry = _run({
            "note": {"total_views": 0, "total_likes": 5},
        }, history_path)
        assert entry["note_views"] is None, f"累積系の0=失敗仮定が崩れた: {entry}"

        print("PASS: x0/note0の混同バグ修正、全ケースOK")


if __name__ == "__main__":
    main()
