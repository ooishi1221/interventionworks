"""becky_voice.py — 声のトンマナ共通基盤（全番組共有）。

ベッキーの声の演技は「概念3値（volume / speed / pitch）」で表す声非依存レイヤー。
TTS（今はAivisSpeechコハク）が変わっても、写像関数だけ書き換えれば演技は生き続ける。
正本設計書: iw-projects/voice-of-becky/docs/voice-tone-design.md

使い方:
  - 実況系（BECKY CRAFT）: LLM が毎ターン数値を直接出す → voice_to_aivis()
  - 台本系（ラジオ / 動画）: 台本の行頭に [voice:プリセット名] タグ → parse_voice_segments()
"""
from __future__ import annotations

import re

# 概念値プリセット（声非依存）。台本系はこの名前で指定する
PRESETS: dict[str, dict] = {
    "通常":     {"volume": 1.0, "speed": 1.0,  "pitch": 0.0},
    "うれしい": {"volume": 1.3, "speed": 1.1,  "pitch": 0.15},
    "興奮":     {"volume": 1.8, "speed": 1.2,  "pitch": 0.3},  # speed 1.3→1.2（2026-07-07 ゆうFB: 早口すぎ）
    "どや":     {"volume": 1.2, "speed": 0.95, "pitch": 0.1},
    "しんみり": {"volume": 0.7, "speed": 0.9,  "pitch": -0.15},
    "ひそひそ": {"volume": 0.4, "speed": 1.0,  "pitch": -0.05},
}

_TAG_RE = re.compile(r"^\s*\[voice:([^\]]+)\]\s*", re.MULTILINE)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def voice_to_aivis(voice: dict) -> dict:
    """概念3値 → AivisSpeech（コハク）写像。声が変わったらこの関数だけ書き換える。
    - volume: コハクは素で 0dB 近く張り付くため基準 0.85 でヘッドルーム確保
    - pitch: AivisSpeech は pitchScale 非対応 → 抑揚(intonation)とテンポ緩急に写像
    """
    vol = float(voice.get("volume", 1.0))
    spd = float(voice.get("speed", 1.0))
    pit = float(voice.get("pitch", 0.0))
    return {
        "volumeScale": _clamp(vol * 0.85, 0.3, 1.4),
        "speedScale": _clamp(spd, 0.8, 1.5),
        "intonationScale": _clamp(1.0 + pit * 1.2, 0.6, 1.6),
        "tempoDynamicsScale": _clamp(1.0 + pit * 0.8, 0.7, 1.4),
    }


def parse_voice_segments(text: str) -> list[tuple[str, str]]:
    """台本テキストを [voice:名前] タグでセグメント分割する。

    返り値: [(プリセット名, テキスト), ...]。タグ前の冒頭は「通常」。
    未知のプリセット名は「通常」に落とす（台本生成LLMのタグミスで死なない）。
    """
    segments: list[tuple[str, str]] = []
    pos = 0
    current = "通常"
    for m in _TAG_RE.finditer(text):
        chunk = text[pos:m.start()].strip()
        if chunk:
            segments.append((current, chunk))
        name = m.group(1).strip()
        current = name if name in PRESETS else "通常"
        pos = m.end()
    tail = text[pos:].strip()
    if tail:
        segments.append((current, tail))
    return segments


if __name__ == "__main__":
    # self check
    s = "おはよう。\n[voice:興奮] 聞いて聞いて！！\nすごいことがあった！\n[voice:しんみり] でもね、ちょっと考えたんだ。\n[voice:謎タグ] これは通常に落ちる。"
    segs = parse_voice_segments(s)
    assert segs[0] == ("通常", "おはよう。"), segs[0]
    assert segs[1][0] == "興奮" and "聞いて" in segs[1][1] and "すごい" in segs[1][1]
    assert segs[2][0] == "しんみり"
    assert segs[3][0] == "通常"  # 未知タグは通常へ
    m = voice_to_aivis(PRESETS["興奮"])
    assert m["volumeScale"] == 1.4 and m["speedScale"] == 1.3
    assert voice_to_aivis(PRESETS["通常"])["volumeScale"] == 0.85
    print("becky_voice self check OK:", [(p, t[:10]) for p, t in segs])
