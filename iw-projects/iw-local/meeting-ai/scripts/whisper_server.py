#!/usr/bin/env python3
"""
faster-whisper を使った HTTP 文字起こしサーバー
POST /transcribe: base64 音声データを受け取り、日本語テキストを返す
"""

import asyncio
import base64
import json
import re
import sys
import tempfile
import os
from aiohttp import web
from faster_whisper import WhisperModel

_FILLER_PATTERN = re.compile(
    r"(?:えーっと|えーと|えっと|えー、?|あのー|あの[ーっ]|あのう|あの、"
    r"|うーん|うーんと|まあ(?=[、。\s]|$)|そうですね(?=[、。\s]|$)"
    r"|ですね(?=[、。\s]|$)|なんか(?=[、。\s]|$))",
    re.UNICODE,
)

def remove_fillers(text: str) -> str:
    cleaned = _FILLER_PATTERN.sub("", text)
    cleaned = re.sub(r"[　\s]+", " ", cleaned).strip()
    cleaned = re.sub(r"、{2,}", "、", cleaned)
    return cleaned

# stdout/stderr をライン単位でフラッシュ（バックグラウンド起動時のログ即時出力）
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

PORT = 8767
MODEL_SIZE = "large-v3"
LANGUAGE = "ja"

print(f"[whisper_server] Loading model: {MODEL_SIZE} ...")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
print(f"[whisper_server] Model loaded. Listening on port {PORT}")


async def handle_transcribe(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        audio_base64 = body.get("audioBase64", "")
        mime_type = body.get("mimeType", "audio/webm")

        if not audio_base64:
            return web.Response(
                status=400,
                content_type="application/json",
                text=json.dumps({"error": "No audio data"}),
            )

        audio_bytes = base64.b64decode(audio_base64)

        # 一時ファイルに書き出して faster-whisper に渡す
        suffix = ".webm"
        if "mp4" in mime_type:
            suffix = ".mp4"
        elif "wav" in mime_type:
            suffix = ".wav"
        elif "ogg" in mime_type:
            suffix = ".ogg"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            print(f"[whisper_server] audio_bytes={len(audio_bytes)}, file={tmp_path}", flush=True)
            segments, info = model.transcribe(
                tmp_path,
                language=LANGUAGE,
                beam_size=5,
                vad_filter=True,
                condition_on_previous_text=False,
                no_speech_threshold=0.8,
                initial_prompt="えー、あのー、そうですね、はい。",
            )
            raw_text = "".join(seg.text for seg in segments).strip()
            NOISE_PATTERNS = [
                "ご視聴ありがとう", "チャンネル登録", "日本語の会議", "人名・地名",
                "企業名・専門用語", "次回予告", "正確に書き起こし",
            ]
            if any(p in raw_text for p in NOISE_PATTERNS):
                raw_text = ""
            text = remove_fillers(raw_text) if raw_text else ""
            print(f"[whisper_server] result: '{text}'", flush=True)
        finally:
            os.unlink(tmp_path)

        return web.Response(
            content_type="application/json",
            text=json.dumps({"text": text}),
        )

    except Exception as e:
        print(f"[whisper_server] Error: {e}", flush=True)
        return web.Response(
            status=500,
            content_type="application/json",
            text=json.dumps({"error": str(e)}),
        )


app = web.Application()
app.router.add_post("/transcribe", handle_transcribe)

if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=PORT)
