#!/usr/bin/env python3
"""
faster-whisper を使った HTTP 文字起こしサーバー
POST /transcribe: base64 音声データを受け取り、日本語テキストを返す
"""

import asyncio
import base64
import json
import tempfile
import os
from aiohttp import web
from faster_whisper import WhisperModel

PORT = 8767
MODEL_SIZE = "medium"
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
            segments, info = model.transcribe(
                tmp_path,
                language=LANGUAGE,
                beam_size=5,
            )
            text = "".join(seg.text for seg in segments).strip()
        finally:
            os.unlink(tmp_path)

        return web.Response(
            content_type="application/json",
            text=json.dumps({"text": text}),
        )

    except Exception as e:
        print(f"[whisper_server] Error: {e}")
        return web.Response(
            status=500,
            content_type="application/json",
            text=json.dumps({"error": str(e)}),
        )


app = web.Application()
app.router.add_post("/transcribe", handle_transcribe)

if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=PORT)
