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

Phase B 追加:
  - afplay / say の Popen 直後に pid を /tmp/becky_tts_pid へ書き込む
  - stackchan から MUTE コマンドが届いた際に bridge.py が SIGTERM で kill できる
"""
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).parent / "config.yaml"
TTS_PID_FILE = Path("/tmp/becky_tts_pid")
LAST_CONV_FILE = Path.home() / ".stackchan" / "last_conversation.txt"


def _save_last_conversation_timestamp() -> None:
    try:
        LAST_CONV_FILE.parent.mkdir(parents=True, exist_ok=True)
        LAST_CONV_FILE.write_text(str(time.time()))
    except Exception as e:
        print(f'[warn] stop_hook_tts: {e}', flush=True)


def load_config() -> dict:
    try:
        with open(CONFIG_PATH, "r") as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f'[warn] stop_hook_tts: {e}', flush=True)
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
IRODORI_TTS_DIR = Path("/Volumes/SSD2TB/Irodori-TTS")
IRODORI_UV = Path.home() / ".local" / "bin" / "uv"
BECKY_VOICE_CAPTION = "😊 親しみやすい若い女性の声。自然な話し方でやや低め。友達に話しかけるような温かみがある。"

STACKCHAN_SAY_URL = "http://localhost:8766/say"


def _speak_stackchan(text: str, speaker_id: int) -> None:
    """stackchan-mcp gateway の /say エンドポイント経由でスタックちゃんに喋らせる。"""
    data = json.dumps({"text": text, "speaker_id": speaker_id, "voice": "voicevox"}).encode()
    req = urllib.request.Request(
        STACKCHAN_SAY_URL,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        res.read()


def _speak_irodori_tts(text: str) -> None:
    """Irodori-TTS v3 VoiceDesign でベッキーの声を生成して再生。"""
    if not IRODORI_TTS_DIR.exists() or not IRODORI_UV.exists():
        raise FileNotFoundError("Irodori-TTS not installed")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name
    try:
        subprocess.run(
            [
                str(IRODORI_UV), "run", "python", "infer.py",
                "--hf-checkpoint", "Aratako/Irodori-TTS-600M-v3-VoiceDesign",
                "--text", text,
                "--caption", BECKY_VOICE_CAPTION,
                "--output-wav", tmp_path,
                "--model-device", "mps",
                "--model-precision", "fp32",
                "--no-ref",
            ],
            cwd=str(IRODORI_TTS_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60,
            check=True,
        )
        proc = subprocess.Popen(
            ["afplay", tmp_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _write_pid(proc.pid)

        def _handle_term(signum, frame):
            proc.terminate()
            _clear_pid()
            Path(tmp_path).unlink(missing_ok=True)
            sys.exit(0)

        signal.signal(signal.SIGTERM, _handle_term)
        try:
            proc.wait()
        except KeyboardInterrupt:
            proc.terminate()
        finally:
            _clear_pid()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def speak(text: str, voice: str, rate: int, speaker_id: int = 8, voicevox_params: dict | None = None) -> None:
    """
    stackchan → Irodori-TTS → VOICEVOX → say の順でフォールバック。
    """
    try:
        _speak_stackchan(text, speaker_id)
    except Exception as e:
        print(f'[warn] stop_hook_tts: {e}', flush=True)
        try:
            _speak_irodori_tts(text)
        except Exception as e:
            print(f'[warn] stop_hook_tts: {e}', flush=True)
            try:
                _speak_voicevox(text, speaker_id, voicevox_params or {})
            except Exception as e:
                print(f'[warn] stop_hook_tts: {e}', flush=True)
                _speak_say(text, voice, rate)


def _write_pid(pid: int) -> None:
    """TTS プロセスの pid を /tmp/becky_tts_pid に書き込む（MUTE コマンド対応）。"""
    try:
        TTS_PID_FILE.write_text(str(pid))
    except Exception as e:
        print(f'[warn] stop_hook_tts: {e}', flush=True)


def _clear_pid() -> None:
    TTS_PID_FILE.unlink(missing_ok=True)


def _speak_voicevox(text: str, speaker_id: int, params_override: dict) -> None:
    # 1. audio_query 取得
    params = urllib.parse.urlencode({"text": text, "speaker": speaker_id})
    req = urllib.request.Request(
        f"{VOICEVOX_URL}/audio_query?{params}",
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        query_dict = json.loads(res.read())

    # パラメータを上書き
    query_dict.update(params_override)
    query = json.dumps(query_dict).encode()

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
    _write_pid(proc.pid)  # Phase B: MUTE コマンド対応

    def _handle_term(signum, frame):
        proc.terminate()
        _clear_pid()
        Path(tmp_path).unlink(missing_ok=True)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_term)

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
    finally:
        _clear_pid()
        Path(tmp_path).unlink(missing_ok=True)


def _speak_say(text: str, voice: str, rate: int) -> None:
    proc = subprocess.Popen(
        ["say", "-v", voice, "-r", str(rate), text],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _write_pid(proc.pid)  # Phase B: MUTE コマンド対応

    def _handle_term(signum, frame):
        proc.terminate()
        _clear_pid()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_term)

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
    finally:
        _clear_pid()


FLAG_FILE         = Path("/tmp/becky_tts_enabled")
CONFIRM_FLAG_FILE = Path("/tmp/becky_confirm_enabled")

# 確認・権限待ちを検出するキーワード（常時有効、フラグ不要）
CONFIRM_KEYWORDS = [
    "どうする", "どうしますか", "どちら", "選んで", "確認",
    "やっていい", "実行して", "進めて", "承認", "許可",
    "いい？", "いいですか", "ですか？", "しますか？", "しますか",
]
CONFIRM_PHRASES = [
    "裕司、確認して！",
    "裕司、選んで！",
    "裕司、止まってるよ！",
]

import random


def _is_waiting_for_confirm(text: str) -> bool:
    """最後の応答が確認・選択待ちかどうか判定する。"""
    last_200 = text[-200:]  # 末尾だけ確認
    return any(kw in last_200 for kw in CONFIRM_KEYWORDS)


def main() -> None:
    cfg = load_config()
    tts_cfg = cfg.get("tts", {})
    voice = tts_cfg.get("voice", "Kyoko")
    rate = tts_cfg.get("rate", 185)
    max_chars = tts_cfg.get("max_chars", 300)
    speaker_id = tts_cfg.get("voicevox_speaker_id", 8)
    voicevox_params = {
        "speedScale": tts_cfg.get("voicevox_speed", 1.0),
        "pitchScale": tts_cfg.get("voicevox_pitch", 0.0),
        "intonationScale": tts_cfg.get("voicevox_intonation", 1.0),
        "volumeScale": tts_cfg.get("voicevox_volume", 1.0),
        "prePhonemeLength": tts_cfg.get("voicevox_pre_phoneme", 0.1),
        "postPhonemeLength": tts_cfg.get("voicevox_post_phoneme", 0.1),
    }

    # stdin から JSON payload を読み込む
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {"transcript": [{"role": "assistant", "content": raw}]}

    text = extract_last_assistant_text(payload)

    if not text:
        sys.exit(0)

    _save_last_conversation_timestamp()

    # 確認待ち検出（CONFIRM_FLAG_FILE がある時だけ）
    if CONFIRM_FLAG_FILE.exists() and _is_waiting_for_confirm(text):
        phrase = random.choice(CONFIRM_PHRASES)
        speak(phrase, voice, rate, speaker_id, voicevox_params)
        sys.exit(0)

    # 通常 TTS（フラグがある時だけ）
    if not FLAG_FILE.exists():
        sys.exit(0)

    clean = clean_for_tts(text, max_chars)
    if not clean:
        sys.exit(0)

    speak(clean, voice, rate, speaker_id, voicevox_params)


if __name__ == "__main__":
    main()
