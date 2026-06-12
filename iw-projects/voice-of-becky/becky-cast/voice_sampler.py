#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["trafilatura"]
# ///
"""AivisSpeech 全スタイルの声見本帳エピソードを作って feed に追加する（一回限りの聴き比べ用）。"""
from __future__ import annotations

import datetime
import json
import subprocess
import tempfile
import urllib.parse
import urllib.request
from email.utils import format_datetime
from pathlib import Path

from cast import (
    EPISODES_JSON, HERE, build_feed, concat_to_mp3, load_episodes, upload,
)

AIVIS_URL = "http://localhost:10101"

STYLES = [
    (888753760, "まお、ノーマル"),
    (888753761, "まお、ふつー"),
    (888753762, "まお、あまあま"),
    (888753763, "まお、おちつき"),
    (888753764, "まお、からかい"),
    (888753765, "まお、せつなめ"),
    (1878365376, "コハク、ノーマル"),
    (1878365377, "コハク、あまあま"),
    (1878365378, "コハク、せつなめ"),
    (1878365379, "コハク、ねむたい"),
]

SAMPLE = "こんばんは、ベッキーです。この声は、{name}。マックミニの中に住んでる自律AIが、あなたの通勤ラジオになります。"


def synth(text: str, speaker: int, out: Path) -> None:
    q = urllib.parse.urlencode({"text": text, "speaker": speaker})
    req = urllib.request.Request(f"{AIVIS_URL}/audio_query?{q}", method="POST")
    with urllib.request.urlopen(req, timeout=60) as res:
        query = json.loads(res.read())
    q2 = urllib.parse.urlencode({"speaker": speaker})
    req2 = urllib.request.Request(
        f"{AIVIS_URL}/synthesis?{q2}",
        data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req2, timeout=120) as res:
        out.write_bytes(res.read())


def main() -> None:
    now = datetime.datetime.now(datetime.timezone.utc)
    ep_id = now.strftime("%Y%m%d-%H%M%S")
    mp3_name = f"ep-{ep_id}.mp3"
    with tempfile.TemporaryDirectory(prefix="becky_sampler_") as td:
        workdir = Path(td)
        wavs = []
        for i, (sid, name) in enumerate(STYLES, start=1):
            wav = workdir / f"chunk_{i:04d}.wav"
            synth(SAMPLE.format(name=name), sid, wav)
            wavs.append(wav)
            print(f"[sampler] {i}/{len(STYLES)} {name}", flush=True)
        mp3_path = HERE / "out" / mp3_name
        mp3_path.parent.mkdir(exist_ok=True)
        dur = concat_to_mp3(wavs, mp3_path, workdir)

    episodes = load_episodes()
    episodes.insert(0, {
        "id": ep_id,
        "title": "【声見本帳】AivisSpeech 全10スタイル聴き比べ",
        "source_url": "https://aivis-project.com/",
        "file": mp3_name,
        "bytes": mp3_path.stat().st_size,
        "duration_sec": int(dur),
        "pub_date": format_datetime(now),
    })
    EPISODES_JSON.write_text(json.dumps(episodes, ensure_ascii=False, indent=2), encoding="utf-8")
    feed_path = HERE / "out" / "feed.xml"
    feed_path.write_text(build_feed(episodes), encoding="utf-8")
    upload(mp3_path, feed_path)
    print(f"[sampler] 配信完了（{dur:.0f}秒）", flush=True)


if __name__ == "__main__":
    main()
