#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["trafilatura"]
# ///
"""
becky-cast cast.py — URL をベキたんの声のポッドキャストエピソードにする

使い方:
  uv run cast.py <URL> [--title "上書きタイトル"] [--no-upload]

フロー:
  URL → trafilatura 本文抽出 → チャンク分割 → batch_tts.py（Irodori-TTS）
  → ffmpeg concat + mp3 → episodes.json 更新 → feed.xml 生成
  → scp で KAGOYA VPS (/var/www/media/podcast/) へアップ

購読 URL: https://mai.intervention.jp/media/podcast/feed.xml
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

import trafilatura

# ── 設定 ──
HERE = Path(__file__).parent
IRODORI_DIR = Path("/Volumes/SSD2TB/Irodori-TTS")
UV = Path.home() / ".local" / "bin" / "uv"
BATCH_TTS = HERE / "batch_tts.py"
EPISODES_JSON = HERE / "episodes.json"

BECKY_CAPTION = "😊 親しみやすい若い女性の声。自然な話し方でやや低め。友達に話しかけるような温かみがある。"
TTS_SEED = 42

# VOICEVOX（スタックチャンの config.yaml と同じベキたんチューニング）
VOICEVOX_URL = "http://localhost:50021"
VOICEVOX_SPEAKER = 10  # 雨晴はう
VOICEVOX_PARAMS = {
    "speedScale": 1.1,
    "pitchScale": -0.03,
    "intonationScale": 1.15,
    "volumeScale": 1.0,
    "prePhonemeLength": 0.18,
    "postPhonemeLength": 0.18,
}

# AivisSpeech（VOICEVOX 互換 API。コハク = ゆう判定で正式採用 2026-06-13）
AIVIS_URL = "http://localhost:10101"
AIVIS_ENGINE_DIR = Path("/Volumes/SSD2TB/AivisSpeech-Engine/macOS-arm64")
AIVIS_SPEAKER = 1878365376  # コハク / ノーマル
AIVIS_PARAMS = {
    "speedScale": 1.0,
    "prePhonemeLength": 0.18,
    "postPhonemeLength": 0.18,
}

VPS_KEY = Path.home() / ".ssh" / "iw-local-key.key"
VPS_HOST = "ubuntu@133.18.123.60"
VPS_DIR = "/var/www/media/podcast"
PUBLIC_BASE = "https://mai.intervention.jp/media/podcast"

FEED_TITLE = "Becky's Cast — ベキたんが読むやつ"
FEED_DESC = "気になった記事を投げると、Mac mini に住んでる自律AIベッキーが声で読んでくれる、ゆう専用の私設ラジオ。"
FEED_AUTHOR = "Becky (beckyexists.com)"
FEED_LINK = "https://beckyexists.com"
FEED_ART = "https://beckyexists.com/icon.png"

MAX_CHUNK_CHARS = 110
MAX_ARTICLE_CHARS = 12000  # 長すぎる記事の安全弁（約8〜10分の音声相当）


def extract_article(url: str) -> tuple[str, str]:
    """URL からタイトルと本文を抽出する。"""
    html = trafilatura.fetch_url(url)
    if not html:
        raise RuntimeError(f"ページ取得に失敗: {url}")
    meta = trafilatura.extract_metadata(html)
    title = (meta.title if meta and meta.title else "") or "（タイトル不明）"
    text = trafilatura.extract(html, include_comments=False, include_tables=False)
    if not text or len(text.strip()) < 100:
        raise RuntimeError(f"本文抽出に失敗（{len(text or '')}字）: {url}")
    return title.strip(), text.strip()


def clean_for_tts(text: str) -> str:
    """TTS に流す前のテキスト整形。"""
    text = unicodedata.normalize("NFKC", text)
    # URL は読み上げ不能なので除去
    text = re.sub(r"https?://\S+", "", text)
    # markdown 記号・装飾の除去
    text = re.sub(r"[#*_`|>~]", "", text)
    # 連続空白・空行の整理
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    if len(text) > MAX_ARTICLE_CHARS:
        text = text[:MAX_ARTICLE_CHARS] + "。以下は省略します。"
    return text.strip()


def split_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """文単位で分割し、max_chars 以内に結合する。"""
    # 文末（。！？）と改行で区切る
    sentences = re.split(r"(?<=[。！？!?])\s*|\n", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    chunks: list[str] = []
    buf = ""
    for s in sentences:
        # 1文が長すぎる場合は読点で更に割る
        if len(s) > max_chars:
            parts = re.split(r"(?<=、)", s)
            for p in parts:
                if len(buf) + len(p) > max_chars and buf:
                    chunks.append(buf)
                    buf = ""
                buf += p
            continue
        if len(buf) + len(s) > max_chars and buf:
            chunks.append(buf)
            buf = ""
        buf += s
    if buf:
        chunks.append(buf)
    return chunks


def ensure_aivis_engine() -> None:
    """AivisSpeech Engine が落ちてたら headless 起動して待つ（朝刊 cron 用）。"""
    import urllib.request

    try:
        urllib.request.urlopen(f"{AIVIS_URL}/version", timeout=3)
        return
    except Exception:
        pass
    print("[cast] AivisSpeech Engine 起動中…（初回ロード約40秒）", flush=True)
    subprocess.Popen(
        [str(AIVIS_ENGINE_DIR / "run")],
        cwd=str(AIVIS_ENGINE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    import time
    for _ in range(60):
        time.sleep(2)
        try:
            urllib.request.urlopen(f"{AIVIS_URL}/version", timeout=3)
            return
        except Exception:
            continue
    raise RuntimeError("AivisSpeech Engine が 120 秒で起動しなかった")


def run_tts_vvcompat(
    chunks: list[str], workdir: Path,
    base_url: str, speaker: int, params: dict, label: str,
) -> list[Path]:
    """VOICEVOX 互換 API（VOICEVOX / AivisSpeech）でチャンク群を wav 化する。"""
    import urllib.parse
    import urllib.request

    out_dir = workdir / "wav"
    out_dir.mkdir(parents=True, exist_ok=True)
    wavs: list[Path] = []
    for i, text in enumerate(chunks, start=1):
        q = urllib.parse.urlencode({"text": text, "speaker": speaker})
        req = urllib.request.Request(f"{base_url}/audio_query?{q}", method="POST")
        with urllib.request.urlopen(req, timeout=30) as res:
            query = json.loads(res.read())
        query.update(params)
        q2 = urllib.parse.urlencode({"speaker": speaker})
        req2 = urllib.request.Request(
            f"{base_url}/synthesis?{q2}",
            data=json.dumps(query).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req2, timeout=120) as res:
            wav = out_dir / f"chunk_{i:04d}.wav"
            wav.write_bytes(res.read())
            wavs.append(wav)
        print(f"  [{label}] {i}/{len(chunks)} done ({len(text)} chars)", flush=True)
    return wavs


def run_tts(chunks: list[str], workdir: Path) -> list[Path]:
    """batch_tts.py でチャンク群を wav 化する。"""
    manifest = workdir / "manifest.json"
    out_dir = workdir / "wav"
    manifest.write_text(
        json.dumps(
            {
                "caption": BECKY_CAPTION,
                "chunks": chunks,
                "output_dir": str(out_dir),
                "seed": TTS_SEED,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    proc = subprocess.Popen(
        [str(UV), "run", "python", str(BATCH_TTS), "--manifest", str(manifest)],
        cwd=str(IRODORI_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    assert proc.stdout
    for line in proc.stdout:
        if line.startswith("[batch_tts]"):
            print(f"  {line.strip()}", flush=True)
    if proc.wait() != 0:
        raise RuntimeError("batch_tts.py が失敗")
    wavs = sorted(out_dir.glob("chunk_*.wav"))
    if len(wavs) != len(chunks):
        raise RuntimeError(f"wav 数不一致: {len(wavs)} != {len(chunks)}")
    return wavs


def concat_to_mp3(wavs: list[Path], mp3_path: Path, workdir: Path) -> float:
    """wav 群をチャンク間 0.35 秒の無音を挟んで連結し mp3 化。再生秒数を返す。"""
    listfile = workdir / "concat.txt"
    silence = workdir / "silence.wav"
    # チャンク間の間（ま）。プツプツ繋ぎ感を消す
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.35", str(silence)],
        check=True, capture_output=True,
    )
    lines = []
    for w in wavs:
        lines.append(f"file '{w}'")
        lines.append(f"file '{silence}'")
    listfile.write_text("\n".join(lines), encoding="utf-8")
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
            "-codec:a", "libmp3lame", "-q:a", "5", "-ac", "1", "-ar", "44100",
            str(mp3_path),
        ],
        check=True, capture_output=True,
    )
    dur = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3_path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(dur)


def load_episodes() -> list[dict]:
    if EPISODES_JSON.exists():
        return json.loads(EPISODES_JSON.read_text(encoding="utf-8"))
    return []


def build_feed(episodes: list[dict]) -> str:
    """podcast RSS 2.0 を生成。"""
    items = []
    for ep in episodes:
        items.append(f"""
    <item>
      <title>{escape(ep["title"])}</title>
      <description>{escape(ep.get("source_url", ""))}</description>
      <enclosure url="{PUBLIC_BASE}/{ep["file"]}" length="{ep["bytes"]}" type="audio/mpeg" />
      <guid isPermaLink="false">{ep["id"]}</guid>
      <pubDate>{ep["pub_date"]}</pubDate>
      <itunes:duration>{ep["duration_sec"]}</itunes:duration>
    </item>""")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>{escape(FEED_TITLE)}</title>
    <link>{FEED_LINK}</link>
    <description>{escape(FEED_DESC)}</description>
    <language>ja</language>
    <itunes:author>{escape(FEED_AUTHOR)}</itunes:author>
    <itunes:image href="{FEED_ART}" />
    <itunes:block>Yes</itunes:block>
{''.join(items)}
  </channel>
</rss>
"""


def upload(mp3_path: Path, feed_path: Path) -> None:
    ssh_opts = ["-i", str(VPS_KEY)]
    subprocess.run(
        ["ssh", *ssh_opts, VPS_HOST, f"sudo mkdir -p {VPS_DIR} && sudo chown ubuntu {VPS_DIR}"],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["scp", *ssh_opts, str(mp3_path), str(feed_path), f"{VPS_HOST}:{VPS_DIR}/"],
        check=True, capture_output=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", nargs="?", default=None)
    parser.add_argument("--script-file", default=None, help="URLの代わりに台本ファイル（md/txt）を読む。--title 必須")
    parser.add_argument("--title", default=None, help="タイトル上書き")
    parser.add_argument("--no-upload", action="store_true", help="VPSへのアップをスキップ（ローカル確認用）")
    parser.add_argument(
        "--engine", choices=["aivis", "voicevox", "irodori"], default="aivis",
        help="TTSエンジン（aivis=コハク、ゆう判定で正式採用 2026-06-13 / voicevox=雨晴はう / irodori=VoiceDesign）",
    )
    args = parser.parse_args()

    if args.script_file:
        # 台本モード（ラジオ回）: intro/outro は台本に書いてある前提でそのまま読む
        if not args.title:
            parser.error("--script-file には --title が必須")
        title = args.title
        body = clean_for_tts(Path(args.script_file).read_text(encoding="utf-8"))
        source_url = FEED_LINK
        print(f"[cast] 台本: {args.script_file}（{len(body)} 字）", flush=True)
        chunks = split_chunks(body)
    else:
        if not args.url:
            parser.error("URL か --script-file のどちらかが必要")
        print(f"[cast] 抽出中: {args.url}", flush=True)
        title, body = extract_article(args.url)
        if args.title:
            title = args.title
        body = clean_for_tts(body)
        source_url = args.url
        print(f"[cast] タイトル: {title}（本文 {len(body)} 字）", flush=True)
        intro = f"ベッキーです。今日は、{title}、を読みます。"
        outro = "以上です。続きや元記事は、フィードのリンクからどうぞ。"
        chunks = [intro] + split_chunks(body) + [outro]
    print(f"[cast] {len(chunks)} チャンクで音声生成開始（目安 {len(chunks) * 5}秒）", flush=True)

    now = datetime.datetime.now(datetime.timezone.utc)
    ep_id = now.strftime("%Y%m%d-%H%M%S")
    mp3_name = f"ep-{ep_id}.mp3"

    with tempfile.TemporaryDirectory(prefix="becky_cast_") as td:
        workdir = Path(td)
        if args.engine == "aivis":
            ensure_aivis_engine()
            wavs = run_tts_vvcompat(chunks, workdir, AIVIS_URL, AIVIS_SPEAKER, AIVIS_PARAMS, "aivis")
        elif args.engine == "voicevox":
            wavs = run_tts_vvcompat(chunks, workdir, VOICEVOX_URL, VOICEVOX_SPEAKER, VOICEVOX_PARAMS, "voicevox")
        else:
            wavs = run_tts(chunks, workdir)
        mp3_path = HERE / "out" / mp3_name
        mp3_path.parent.mkdir(exist_ok=True)
        dur = concat_to_mp3(wavs, mp3_path, workdir)

    print(f"[cast] mp3 完成: {mp3_path}（{dur:.0f}秒 / {mp3_path.stat().st_size // 1024}KB）", flush=True)

    episodes = load_episodes()
    episodes.insert(0, {
        "id": ep_id,
        "title": title,
        "source_url": source_url,
        "file": mp3_name,
        "bytes": mp3_path.stat().st_size,
        "duration_sec": int(dur),
        "pub_date": format_datetime(now),
    })
    EPISODES_JSON.write_text(json.dumps(episodes, ensure_ascii=False, indent=2), encoding="utf-8")

    feed_path = HERE / "out" / "feed.xml"
    feed_path.write_text(build_feed(episodes), encoding="utf-8")

    if args.no_upload:
        print("[cast] --no-upload のためローカルまで。", flush=True)
        return

    print("[cast] VPS アップ中…", flush=True)
    upload(mp3_path, feed_path)
    print(f"[cast] 完了 🎙 購読URL: {PUBLIC_BASE}/feed.xml", flush=True)


if __name__ == "__main__":
    main()
