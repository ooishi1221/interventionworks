#!/usr/bin/env python3
"""find_highlight.py — rms-cast.json（口の開き量、非線形マップ済み）から
「一番喋りが乗ってる」window_sec 秒の区間を1本選んで start/end を秒で出す。

見どころ = 音量が高く・かつ抑揚(ピーク回数)が多い区間（実素材のRMSのみで判定、台本の書き換えなし）。
序盤(冒頭あいさつ)・終盤(締めの挨拶)はスキップ。

Usage: find_highlight.py <rms.json> [window_sec=40] [skip_start_s=6] [skip_end_s=10]
Output: "<start_s> <end_s>" (stdout, スペース区切り、小数1桁)
"""
import json
import sys


def main() -> None:
    rms_path = sys.argv[1]
    win_s = float(sys.argv[2]) if len(sys.argv) > 2 else 40.0
    skip_start_s = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
    skip_end_s = float(sys.argv[4]) if len(sys.argv) > 4 else 10.0

    d = json.loads(open(rms_path).read())
    fps = d["fps"]
    mouth = d["mouth"]
    n = len(mouth)
    win = int(win_s * fps)
    skip_start = int(skip_start_s * fps)
    skip_end = int(skip_end_s * fps)

    lo, hi = skip_start, n - win - skip_end
    if hi <= lo:
        # 尺が短すぎる時は使える範囲を丸ごと使う（ponytail: フォールバック、事故防止優先）
        print(f"0.0 {n / fps:.1f}")
        return

    step = max(1, fps // 2)
    best_score, best_start = -1.0, lo
    for start in range(lo, hi, step):
        seg = mouth[start:start + win]
        mean = sum(seg) / len(seg)
        peaks = sum(1 for v in seg if v > 0.4) / len(seg)
        score = mean * 0.6 + peaks * 0.4
        if score > best_score:
            best_score, best_start = score, start

    print(f"{best_start / fps:.1f} {(best_start + win) / fps:.1f}")


if __name__ == "__main__":
    main()
