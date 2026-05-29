#!/usr/bin/env python3
"""
Voice of Becky — stackchan-bridge / bridge.py
Phase A: VAD + Whisper + wake word + iTerm2 inject
Phase B: stackchan Serial 受信スレッド追加

Usage:
    .venv/bin/python3 bridge.py [--debug]
"""
import argparse
import collections
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np
import sounddevice as sd
import webrtcvad
import yaml
from faster_whisper import WhisperModel

# ---------------------------------------------------------------------------
# 設定読み込み
# ---------------------------------------------------------------------------
CONFIG_PATH = Path(__file__).parent / "config.yaml"

def load_config() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)

# ---------------------------------------------------------------------------
# VAD ヘルパー
# ---------------------------------------------------------------------------
FRAME_DURATION_MS = 30  # webrtcvad は 10 / 20 / 30ms フレームのみ対応

def collect_voiced_audio(
    vad: webrtcvad.Vad,
    sample_rate: int,
    channels: int,
    device_index,
    silence_frames: int,
    debug: bool,
) -> bytes | None:
    """
    マイクから常時リスニング。
    発話を検知したらその区間の PCM bytes を返す。
    Ctrl-C で None を返す。
    """
    frame_size = int(sample_rate * FRAME_DURATION_MS / 1000)  # samples per frame
    ring = collections.deque(maxlen=10)        # 直前フレームのバッファ（発話頭を取りこぼさない）
    voiced_frames: list[bytes] = []
    num_silence = 0
    triggered = False

    if debug:
        print("[VAD] リスニング開始 — 話しかけてください", flush=True)

    # sounddevice RawInputStream で PCM int16 を取得
    with sd.RawInputStream(
        samplerate=sample_rate,
        channels=channels,
        dtype="int16",
        blocksize=frame_size,
        device=device_index,
    ) as stream:
        while True:
            data, _ = stream.read(frame_size)
            frame = bytes(data)

            # webrtcvad には 2 bytes/sample の PCM が必要
            is_speech = vad.is_speech(frame, sample_rate)

            if not triggered:
                ring.append(frame)
                if is_speech:
                    triggered = True
                    if debug:
                        print("[VAD] 発話検知", flush=True)
                    # ring に貯めた直前フレームも含める
                    voiced_frames.extend(list(ring))
                    ring.clear()
            else:
                voiced_frames.append(frame)
                if is_speech:
                    num_silence = 0
                else:
                    num_silence += 1
                    if num_silence > silence_frames:
                        if debug:
                            print(f"[VAD] 発話終了（{len(voiced_frames)} frames）", flush=True)
                        return b"".join(voiced_frames)

# ---------------------------------------------------------------------------
# Whisper 文字起こし
# ---------------------------------------------------------------------------
def transcribe(model: WhisperModel, audio_bytes: bytes, sample_rate: int, language: str, debug: bool) -> str:
    # bytes → numpy float32
    audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = model.transcribe(audio_np, language=language, beam_size=5)
    text = "".join(seg.text for seg in segments).strip()
    if debug:
        print(f"[Whisper] {text!r}", flush=True)
    return text

# ---------------------------------------------------------------------------
# Wake word チェック
# ---------------------------------------------------------------------------
# Whisper が「ベッキー」を ビッキー / べっきい / べっきー 等に誤変換するため
# 正規表現でゆるくマッチする
_BECKY_RE = re.compile(r"[ベビべ][ッっ]?[キき][ーいぃ]?")
_BEKITAN_RE = re.compile(r"[ベびべ][キき][たタ][んン]")

def has_wake_word(text: str, wake_words: list[str]) -> bool:
    if any(w in text for w in wake_words):
        return True
    if _BECKY_RE.search(text):
        return True
    if _BEKITAN_RE.search(text):
        return True
    return False

# ---------------------------------------------------------------------------
# iTerm2 inject
# ---------------------------------------------------------------------------
def inject_to_iterm2(text: str, wake_words: list[str], wait: float, debug: bool) -> None:
    """
    osascript で iTerm2 の current session にテキストを送信して Enter。
    """
    # wake word を除去して送信（ベキたん系を先に、その後ベッキー系）
    clean = _BEKITAN_RE.sub("", text)
    clean = _BECKY_RE.sub("", clean)
    for ww in wake_words:
        clean = clean.replace(ww, "")
    clean = clean.strip().lstrip("、,，。. ")

    if not clean:
        if debug:
            print("[inject] wake word のみで本文なし — スキップ", flush=True)
        return

    if debug:
        print(f"[inject] -> iTerm2: {clean!r}", flush=True)

    time.sleep(wait)

    # osascript: iTerm2 current session に write text
    script = f'''
tell application "iTerm2"
    tell current session of current window
        write text "{clean.replace('"', '\\"')}"
    end tell
end tell
'''
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and debug:
        print(f"[inject] osascript エラー: {result.stderr.strip()}", flush=True)

# ---------------------------------------------------------------------------
# Claude Code 前面化（osascript）
# ---------------------------------------------------------------------------
def bring_iterm2_to_front(debug: bool) -> None:
    script = '''
tell application "iTerm2"
    activate
end tell
'''
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0 and debug:
        print(f"[wake] iTerm2 前面化エラー: {result.stderr.strip()}", flush=True)

# ---------------------------------------------------------------------------
# stackchan Serial 受信スレッド (Phase B)
# ---------------------------------------------------------------------------
TTS_PID_FILE    = Path("/tmp/becky_tts_pid")
MEMORY_TRIGGER  = Path("/tmp/becky_memory_trigger")
MODE_FILE       = Path("/tmp/becky_mode")


def _handle_serial_command(cmd: str, debug: bool) -> None:
    """
    ESP32 から受信したコマンドを処理する。
    """
    cmd = cmd.strip()

    if cmd.startswith("MODE:"):
        # MODE:0 / MODE:1 / MODE:2 → /tmp/becky_mode に書き込み
        mode_val = cmd.split(":", 1)[1]
        try:
            MODE_FILE.write_text(mode_val)
            if debug:
                print(f"[serial] mode -> {mode_val}", flush=True)
        except Exception as e:
            print(f"[serial] MODE write error: {e}", flush=True)

    elif cmd == "MUTE":
        # 実行中の TTS プロセスを kill
        if debug:
            print("[serial] MUTE received — TTS kill", flush=True)
        if TTS_PID_FILE.exists():
            try:
                pid = int(TTS_PID_FILE.read_text().strip())
                os.kill(pid, 15)  # SIGTERM
                TTS_PID_FILE.unlink(missing_ok=True)
                if debug:
                    print(f"[serial] killed TTS pid={pid}", flush=True)
            except (ValueError, ProcessLookupError, PermissionError) as e:
                if debug:
                    print(f"[serial] MUTE kill error: {e}", flush=True)
        else:
            if debug:
                print("[serial] MUTE: pid file not found", flush=True)

    elif cmd == "MEMORY":
        # /tmp/becky_memory_trigger を touch（後フェーズで insight-queue 連携）
        if debug:
            print("[serial] MEMORY received — touch trigger", flush=True)
        MEMORY_TRIGGER.touch()

    elif cmd == "WAKE":
        # Claude Code（iTerm2）を前面に出す
        if debug:
            print("[serial] WAKE received — bring iTerm2 to front", flush=True)
        bring_iterm2_to_front(debug)

    elif cmd == "BOOT":
        if debug:
            print("[serial] stackchan booted", flush=True)

    else:
        if debug and cmd:
            print(f"[serial] unknown cmd: {cmd!r}", flush=True)


def serial_listener_thread(port: str, baudrate: int, debug: bool) -> None:
    """
    デーモンスレッドとして動作。pyserial で Serial を監視して _handle_serial_command に渡す。
    pyserial が未インストールの場合はワーニングだけ出して静かに終了。
    """
    try:
        import serial  # pyserial
    except ImportError:
        print("[serial] pyserial が未インストールのため Serial 監視をスキップします。", flush=True)
        print("[serial] インストール: .venv/bin/pip install pyserial", flush=True)
        return

    while True:
        try:
            if debug:
                print(f"[serial] 接続試行: {port} @ {baudrate}", flush=True)
            with serial.Serial(port, baudrate, timeout=1) as ser:
                if debug:
                    print(f"[serial] 接続成功: {port}", flush=True)
                while True:
                    line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if line:
                        _handle_serial_command(line, debug)
        except Exception as e:
            if debug:
                print(f"[serial] 接続エラー ({e})。5 秒後に再試行...", flush=True)
            time.sleep(5)

# ---------------------------------------------------------------------------
# メインループ
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Voice of Becky — stackchan-bridge")
    parser.add_argument("--debug", action="store_true", help="デバッグ出力を有効化")
    args = parser.parse_args()
    debug: bool = args.debug

    cfg = load_config()
    wake_words: list[str] = cfg["wake_words"]
    sample_rate: int = cfg["audio"]["sample_rate"]
    channels: int = cfg["audio"]["channels"]
    device_index = cfg["audio"]["device_index"]  # None = default
    vad_aggressiveness: int = cfg["vad"]["aggressiveness"]
    silence_frames: int = cfg["vad"]["silence_frames"]
    whisper_model_size: str = cfg["whisper"]["model_size"]
    whisper_language: str = cfg["whisper"]["language"]
    whisper_device: str = cfg["whisper"]["device"]
    whisper_compute: str = cfg["whisper"]["compute_type"]
    iterm_wait: float = cfg["iterm2"]["wait_before_inject"]

    # Serial 設定
    serial_cfg = cfg.get("serial", {})
    serial_enabled: bool = serial_cfg.get("enabled", False)
    serial_port: str = serial_cfg.get("port", "/dev/cu.usbmodem3101")
    serial_baudrate: int = serial_cfg.get("baudrate", 115200)

    print("=== Voice of Becky — Bridge Phase A+B ===", flush=True)
    print(f"Wake words: {wake_words}", flush=True)
    print(f"Whisper model: {whisper_model_size} / {whisper_language} / {whisper_device}", flush=True)

    # stackchan Serial 監視スレッド起動（Phase B）
    if serial_enabled:
        t = threading.Thread(
            target=serial_listener_thread,
            args=(serial_port, serial_baudrate, debug),
            daemon=True,
            name="serial-listener",
        )
        t.start()
        print(f"[serial] 監視スレッド開始: {serial_port}", flush=True)
    else:
        print("[serial] 無効（config.yaml serial.enabled: false）", flush=True)

    # Whisper モデルロード（初回は HuggingFace からダウンロード）
    print("Whisper モデルをロード中...", flush=True)
    model = WhisperModel(
        whisper_model_size,
        device=whisper_device,
        compute_type=whisper_compute,
    )
    print("モデルロード完了。リスニング開始します。", flush=True)
    print("Ctrl-C で停止\n", flush=True)

    vad = webrtcvad.Vad(vad_aggressiveness)

    try:
        while True:
            audio_bytes = collect_voiced_audio(
                vad=vad,
                sample_rate=sample_rate,
                channels=channels,
                device_index=device_index,
                silence_frames=silence_frames,
                debug=debug,
            )
            if audio_bytes is None:
                break

            text = transcribe(model, audio_bytes, sample_rate, whisper_language, debug)

            if not text:
                continue

            if has_wake_word(text, wake_words):
                print(f"[wake] {text!r}", flush=True)
                inject_to_iterm2(text, wake_words, iterm_wait, debug)
            else:
                if debug:
                    print(f"[skip] wake word なし: {text!r}", flush=True)

    except KeyboardInterrupt:
        print("\nBridge 停止。", flush=True)

if __name__ == "__main__":
    main()
