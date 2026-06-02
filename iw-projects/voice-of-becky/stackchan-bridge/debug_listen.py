#!/usr/bin/env python3
"""
debug_listen.py — stackchan-mcp listen デバッグスクリプト

使い方:
  1. gateway プロセスを停止する (ps aux | grep stackchan_mcp -> kill <pid>)
  2. このスクリプトを実行する:
       .venv/bin/python3 debug_listen.py [--duration 8000] [--ip 192.168.68.67]
  3. ESP32 が接続してきたら "どうぞ" と話しかける
  4. 終了後 /tmp/becky_listen_debug.wav が作成される → 再生して確認

診断ポイント:
  - Opus フレームのサイズ: 無音 = 3〜4 byte / 有音 = 100〜400 byte
  - PCM RMS: 0 に近い = 無音 / 100 以上 = 有音
  - WAV 再生: 実際に音が入っているか耳で確認
"""

import argparse
import asyncio
import json
import logging
import math
import struct
import uuid
import wave
import os
import sys
from pathlib import Path

import websockets
import websockets.exceptions
from websockets.asyncio.server import ServerConnection

# --- パス設定 ---
SCRIPT_DIR = Path(__file__).parent
VENV_SITE = SCRIPT_DIR / ".venv" / "lib"
# site-packages を sys.path に追加
for p in VENV_SITE.glob("python*/site-packages"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("debug_listen")

WAV_OUTPUT = "/tmp/becky_listen_debug.wav"
WS_PORT = 8765
SAMPLE_RATE = 16000
CHANNELS = 1
FRAME_DURATION_MS = 60
SAMPLES_PER_FRAME = SAMPLE_RATE * FRAME_DURATION_MS // 1000  # 960


def rms(pcm_bytes: bytes) -> float:
    """Signed int16 PCM の RMS を計算する。"""
    if not pcm_bytes:
        return 0.0
    samples = struct.unpack(f"<{len(pcm_bytes) // 2}h", pcm_bytes)
    sq_sum = sum(s * s for s in samples)
    return math.sqrt(sq_sum / len(samples))


def decode_all_frames(frames: list[bytes]) -> bytes:
    """opuslib で全フレームをデコードして PCM を返す。"""
    import opuslib
    decoder = opuslib.Decoder(SAMPLE_RATE, CHANNELS)
    chunks = []
    for i, frame in enumerate(frames):
        if not frame:
            logger.warning("  frame[%d]: EMPTY (skip)", i)
            continue
        try:
            pcm = decoder.decode(frame, SAMPLES_PER_FRAME)
            frame_rms = rms(pcm)
            size_label = f"{len(frame):4d} bytes"
            rms_label = f"RMS={frame_rms:7.1f}"
            speech_hint = " *** SPEECH ***" if frame_rms > 200 else ""
            logger.info("  frame[%03d]: %s  %s%s", i, size_label, rms_label, speech_hint)
            chunks.append(pcm)
        except Exception as e:
            logger.warning("  frame[%d]: decode error: %s (skip)", i, e)
    return b"".join(chunks)


def save_wav(pcm: bytes, path: str) -> None:
    with wave.open(path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)  # int16
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)
    logger.info("WAV saved: %s (%d bytes PCM)", path, len(pcm))


async def run_debug(duration_ms: int) -> None:
    frames_captured: list[bytes] = []
    handshake_done = asyncio.Event()
    capture_done = asyncio.Event()
    session_id_ref: list[str] = []

    async def handler(ws: ServerConnection) -> None:
        session_id = str(uuid.uuid4())
        session_id_ref.append(session_id)
        logger.info("=== ESP32 connected (session=%s) ===", session_id)

        # hello 待ち & hello response 送信
        hello_received = False
        listen_start_sent = False

        async for message in ws:
            if isinstance(message, bytes):
                size = len(message)
                frames_captured.append(message)
                logger.debug("binary frame[%d] size=%d", len(frames_captured), size)
                # フレーム数が期待値に達したら終了
                expected = int(duration_ms / FRAME_DURATION_MS) + 10
                if len(frames_captured) >= expected:
                    logger.info("=== capture window full (%d frames) ===", len(frames_captured))
                    # listen.stop 送信
                    stop_msg = json.dumps({
                        "session_id": session_id,
                        "type": "listen",
                        "state": "stop",
                    })
                    await ws.send(stop_msg)
                    logger.info("listen.stop sent")
                    capture_done.set()
                    break
                continue

            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                logger.warning("invalid JSON: %s", message[:80])
                continue

            msg_type = data.get("type", "")
            logger.info("JSON message type=%s", msg_type)

            if msg_type == "hello" and not hello_received:
                hello_received = True
                proto_ver = data.get("version", 1)
                logger.info("hello received: version=%s features=%s", proto_ver, data.get("features"))

                # hello response
                resp = {
                    "type": "hello",
                    "session_id": session_id,
                    "version": 1,
                    "transport": "websocket",
                }
                await ws.send(json.dumps(resp))
                logger.info("hello response sent (session=%s)", session_id)
                handshake_done.set()

                # 少し待ってから listen.start
                await asyncio.sleep(0.2)
                start_msg = json.dumps({
                    "session_id": session_id,
                    "type": "listen",
                    "state": "start",
                    "mode": "manual",
                })
                await ws.send(start_msg)
                listen_start_sent = True
                logger.info("=== listen.start sent — 話しかけてください ===")

                # タイムアウト付き待機（フレームループが break しなかった場合）
                try:
                    await asyncio.wait_for(capture_done.wait(), timeout=duration_ms / 1000.0 + 3)
                except asyncio.TimeoutError:
                    if listen_start_sent:
                        stop_msg = json.dumps({
                            "session_id": session_id,
                            "type": "listen",
                            "state": "stop",
                        })
                        await ws.send(stop_msg)
                        logger.info("listen.stop sent (timeout path)")
                    capture_done.set()
                break  # メッセージループを抜ける

    server = await websockets.serve(handler, "0.0.0.0", WS_PORT)
    logger.info("WebSocket server listening on ws://0.0.0.0:%d", WS_PORT)
    logger.info("ESP32 (192.168.68.67) の接続を待っています...")
    logger.info("duration_ms=%d (最大 %.1f 秒)", duration_ms, duration_ms / 1000)

    await capture_done.wait()
    server.close()
    await server.wait_closed()

    logger.info("")
    logger.info("=== CAPTURE SUMMARY ===")
    logger.info("total frames: %d", len(frames_captured))
    logger.info("expected for %dms: ~%d frames", duration_ms, duration_ms // FRAME_DURATION_MS)

    if not frames_captured:
        logger.error("フレームが 1 枚も届きませんでした。ESP32 が listen.start に反応していない可能性があります。")
        return

    # フレームサイズの統計
    sizes = [len(f) for f in frames_captured]
    logger.info("frame size: min=%d  max=%d  avg=%.1f", min(sizes), max(sizes), sum(sizes) / len(sizes))
    silent_count = sum(1 for s in sizes if s <= 10)
    logger.info("silent frames (<=10 bytes): %d / %d (%.0f%%)",
                silent_count, len(sizes), 100 * silent_count / len(sizes))

    logger.info("")
    logger.info("=== DECODING OPUS FRAMES ===")
    pcm = decode_all_frames(frames_captured)

    if not pcm:
        logger.error("デコード結果が空です。opuslib の decode に失敗した可能性があります。")
        return

    overall_rms = rms(pcm)
    logger.info("")
    logger.info("=== PCM ANALYSIS ===")
    logger.info("total PCM bytes: %d", len(pcm))
    logger.info("overall RMS: %.1f  (>200 = 音声あり, <50 = 無音)", overall_rms)

    if overall_rms < 50:
        logger.warning("!!! PCM が無音です。ESP32 のマイクが音を拾っていない可能性があります。")
        logger.warning("    確認: スタックチャンのマイクに向かって大きな声で話しましたか？")
    else:
        logger.info("PCM に音声データが確認できました。faster-whisper の問題を疑ってください。")

    save_wav(pcm, WAV_OUTPUT)
    logger.info("")
    logger.info("=== DONE ===")
    logger.info("WAV ファイルを再生して確認: open %s", WAV_OUTPUT)
    logger.info("または: afplay %s", WAV_OUTPUT)


def main() -> None:
    parser = argparse.ArgumentParser(description="stackchan listen デバッグ")
    parser.add_argument("--duration", type=int, default=8000,
                        help="録音時間 (ms, default: 8000)")
    parser.add_argument("--ip", default="192.168.68.67",
                        help="ESP32 の IP（参考情報のみ、接続は ESP32 側から来る）")
    args = parser.parse_args()

    logger.info("debug_listen.py 起動 (duration=%dms, esp32_ip=%s)", args.duration, args.ip)
    asyncio.run(run_debug(args.duration))


if __name__ == "__main__":
    main()
