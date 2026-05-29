#!/usr/bin/env python3
"""
Voice of Becky — stop_hook_tts.py
Claude Code Stop hook から呼ばれる TTS スクリプト。

動作:
  - stdin から Claude Code の JSON hook payload を読み込む
  - transcript（最後の assistant メッセージ）を抽出
  - `say -v Kyoko` で読み上げ（subprocess で管理、将来 B ボタンで中断可能）

Claude Code Stop hook の payload 仕様:
  {
    "session_id": "...",
    "transcript": [
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }
"""
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).parent / "config.yaml"


def load_config() -> dict:
    try:
        with open(CONFIG_PATH, "r") as f:
            return yaml.safe_load(f)
    except Exception:
        return {}


def extract_last_assistant_text(payload: dict) -> str | None:
    """
    hook payload から最後の assistant メッセージ本文を取り出す。
    Claude Code Stop hook の実際の payload は last_assistant_message に直接テキストが入る。
    """
    # 実際の payload 形式: last_assistant_message フィールド
    msg = payload.get("last_assistant_message", "")
    if msg:
        return msg.strip()

    # フォールバック: transcript 配列形式（旧仕様 / デバッグ用）
    transcript = payload.get("transcript", [])
    for entry in reversed(transcript):
        if entry.get("role") == "assistant":
            content = entry.get("content", "")
            if isinstance(content, list):
                texts = [
                    b.get("text", "")
                    for b in content
                    if isinstance(b, dict) and b.get("type") == "text"
                ]
                text = " ".join(texts)
            else:
                text = str(content)
            return text.strip()
    return None


def clean_for_tts(text: str, max_chars: int) -> str:
    """
    Markdown 記法を除去して TTS に渡せる平文に変換。
    """
    # コードブロック除去
    text = re.sub(r"```[\s\S]*?```", "（コードブロック省略）", text)
    # インラインコード除去
    text = re.sub(r"`[^`]+`", "", text)
    # 見出し記号除去
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    # 太字・斜体除去
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    # リンク除去 [text](url) → text
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # 連続空白を整理
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    # 文字数制限
    if len(text) > max_chars:
        text = text[:max_chars] + "…（以下省略）"
    return text


VOICEVOX_URL = "http://localhost:50021"


def speak(text: str, voice: str, rate: int, speaker_id: int = 8) -> None:
    """
    VOICEVOX API で読み上げ。失敗時は say コマンドにフォールバック。
    """
    try:
        _speak_voicevox(text, speaker_id)
    except Exception:
        _speak_say(text, voice, rate)


def _speak_voicevox(text: str, speaker_id: int) -> None:
    # 1. audio_query 取得
    params = urllib.parse.urlencode({"text": text, "speaker": speaker_id})
    req = urllib.request.Request(
        f"{VOICEVOX_URL}/audio_query?{params}",
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        query = res.read()

    # 2. synthesis（WAV 生成）
    params2 = urllib.parse.urlencode({"speaker": speaker_id})
    req2 = urllib.request.Request(
        f"{VOICEVOX_URL}/synthesis?{params2}",
        data=query,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req2, timeout=30) as res2:
        wav_data = res2.read()

    # 3. 一時ファイルに書いて afplay で再生
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav_data)
        tmp_path = f.name

    proc = subprocess.Popen(
        ["afplay", tmp_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    def _handle_term(signum, frame):
        proc.terminate()
        Path(tmp_path).unlink(missing_ok=True)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_term)

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _speak_say(text: str, voice: str, rate: int) -> None:
    proc = subprocess.Popen(
        ["say", "-v", voice, "-r", str(rate), text],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    def _handle_term(signum, frame):
        proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_term)

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()


FLAG_FILE = Path("/tmp/becky_tts_enabled")


def main() -> None:
    # フラグファイルがなければ黙って終了
    if not FLAG_FILE.exists():
        sys.exit(0)

    cfg = load_config()
    tts_cfg = cfg.get("tts", {})
    voice = tts_cfg.get("voice", "Kyoko")
    rate = tts_cfg.get("rate", 185)
    max_chars = tts_cfg.get("max_chars", 300)
    speaker_id = tts_cfg.get("voicevox_speaker_id", 8)

    # stdin から JSON payload を読み込む
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        # JSON でなければそのまま text として扱う（デバッグ用）
        payload = {"transcript": [{"role": "assistant", "content": raw}]}

    text = extract_last_assistant_text(payload)

    if not text:
        # transcript が取れない場合は何もしない（サイレント終了）
        sys.exit(0)

    clean = clean_for_tts(text, max_chars)

    if not clean:
        sys.exit(0)

    speak(clean, voice, rate, speaker_id)


if __name__ == "__main__":
    main()
