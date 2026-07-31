#!/usr/bin/env python3
"""find_news_segment.py — Cast台本から「教えてベキたん」ニュースコーナーの区間を抜き出す。
台本は必ず「さて、ここからはレギュラーコーナー。／教えてベキたん！AIって実際どうなの？」
という定型文言で始まる(morning_cast.pyのプロンプトで固定)。RMSの山場より確実なので、
これを構造マーカーとして使う(TTSはほぼ等速で読むため、文字数比率で音声内の秒数を推定)。

CLI: find_news_segment.py <script.md> <mp3_duration_sec> [window_sec=40]
  stdout: "<start_s> <end_s>"（ニュースコーナーが無い回は非0 exitで何も出さない → 呼び出し側はRMSにフォールバック）

import用: extract_news_section(script_text) -> str | None
  ニュースコーナー本文([voice:]タグ・見出し文言を除いた実質ニュース部分)。
window_text(script_text, duration_s, window_s) -> str | None
  find_segmentが切り出す窓に実際に入る台本テキスト(同じ文字数比率換算)。タイトル生成に使う。
  コーナー全文を渡すと、切り出し40秒に入っていない話題でタイトルが作られ映像検品(crv)で
  「字幕とタイトルの話題が違う」FAILになる(2026-07-30まで連日発生)ため、窓と入力を一致させる。
"""
import re
import sys

START_MARK = "教えてベキたん"
END_MARKS = ("お便り", "ここまでのお相手は")


def _strip(line: str) -> str:
    return re.sub(r"\[voice:[^\]]*\]", "", line).strip()


def _lines(script: str) -> list[str]:
    return [_strip(l) for l in script.splitlines()]


def _news_span(lines: list[str]) -> tuple[int, int] | None:
    """行リスト上でのニュースコーナー本文の [start, end) を返す（startは見出し行の次）"""
    start = next((i for i, l in enumerate(lines) if START_MARK in l), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if any(m in lines[i] for m in END_MARKS)),
               len(lines))
    return start + 1, end


def extract_news_section(script: str) -> str | None:
    lines = _lines(script)
    span = _news_span(lines)
    if span is None:
        return None
    body = "\n".join(l for l in lines[span[0]:span[1]] if l)
    return body or None


def window_text(script: str, duration_s: float, window_s: float = 40.0) -> str | None:
    """find_segmentの窓に実際に入る台本テキスト(ニュースコーナー開始からwindow_s秒ぶん)。
    END_MARKで切らない: 窓がコーナー終端を越える日はお便り等も実際に字幕へ出るため、忠実に含める。"""
    lines = _lines(script)
    span = _news_span(lines)
    if span is None or duration_s <= 0:
        return None
    total_chars = sum(len(l) for l in lines)
    if total_chars == 0:
        return None
    window_chars = int(total_chars * window_s / duration_s)
    body = "\n".join(l for l in lines[span[0]:] if l)
    return body[:window_chars] or None


def find_segment(script: str, duration_s: float, window_s: float = 40.0) -> tuple[float, float] | None:
    """ニュースコーナー開始位置を台本全体の文字数比率で音声内の秒数に変換し、
    そこから window_s 秒（尺が余っていれば）を切り出す区間を返す。"""
    lines = _lines(script)
    span = _news_span(lines)
    if span is None:
        return None
    total_chars = sum(len(l) for l in lines)
    if total_chars == 0:
        return None
    chars_before = sum(len(l) for l in lines[:span[0]])
    start_s = chars_before / total_chars * duration_s
    end_s = min(start_s + window_s, duration_s)
    return round(start_s, 1), round(end_s, 1)


def _selftest() -> None:
    sample = (
        "ベッキーです。\n\n[voice:通常] 近況トーク。\n\n"
        "さて、ここからはレギュラーコーナー。\n教えてベキたん！AIって実際どうなの？\n\n"
        "1本目の話。\nコメント。\n\n"
        "さて——ここで、みんなから届いたお便り。\nお便り本文。\n\n"
        "ここまでのお相手は、ベッキーでした。\n"
    )
    section = extract_news_section(sample)
    assert section and "1本目の話" in section and "お便り本文" not in section
    seg = find_segment(sample, duration_s=120.0, window_s=40.0)
    assert seg is not None and 0 < seg[0] < seg[1] <= 120.0
    assert find_segment("お便りコーナーだけの台本です。", 60.0) is None
    wt = window_text(sample, duration_s=120.0, window_s=40.0)
    assert wt and wt.startswith("1本目の話")
    assert window_text(sample, duration_s=120.0, window_s=5.0) != wt  # 窓が短いほどテキストも短い
    assert window_text("お便りコーナーだけの台本です。", 60.0) is None
    assert window_text(sample, duration_s=0.0) is None
    print("ok")


def main() -> None:
    script_path, duration_s = sys.argv[1], float(sys.argv[2])
    window_s = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
    script = open(script_path, encoding="utf-8").read()
    seg = find_segment(script, duration_s, window_s)
    if seg is None:
        sys.exit(1)
    print(f"{seg[0]} {seg[1]}")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
