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

# 同時処理を1件に制限（キュー）
_semaphore = asyncio.Semaphore(1)


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
        if "m4a" in mime_type:
            suffix = ".m4a"
        elif "mp4" in mime_type:
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
                vad_filter=False,
                condition_on_previous_text=False,
                no_speech_threshold=0.3,
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

        # current.txt に追記
        if text:
            try:
                from datetime import datetime, timezone, timedelta
                jst = timezone(timedelta(hours=9))
                ts = datetime.now(jst).strftime("%H:%M:%S")
                os.makedirs(MEETING_DIR, exist_ok=True)
                with open(CURRENT_FILE, "a", encoding="utf-8") as f:
                    f.write(f"[{ts}] {text}\n")
            except Exception as we:
                print(f"[whisper_server] write error: {we}", flush=True)

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


MEETING_DIR = os.path.expanduser("~/.meeting")
CURRENT_FILE = os.path.join(MEETING_DIR, "current.txt")


async def handle_request(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        items = body.get("items", [])
        memo = body.get("memo", "").strip()

        os.makedirs(MEETING_DIR, exist_ok=True)

        transcript_section = "[文字起こし]\n"
        if os.path.exists(CURRENT_FILE):
            with open(CURRENT_FILE, "r", encoding="utf-8") as f:
                raw = f.read()
            idx = raw.find("[文字起こし]")
            if idx >= 0:
                transcript_section = raw[idx:]
            else:
                transcript_section = f"[文字起こし]\n{raw}"

        lines = [f"- {i}" for i in items if i]
        if memo:
            lines.append(f"- メモ: {memo}")
        request_block = "\n".join(lines)
        content = f"[お願い]\n{request_block}\n\n{transcript_section}"

        with open(CURRENT_FILE, "w", encoding="utf-8") as f:
            f.write(content)

        return web.Response(
            content_type="application/json",
            text=json.dumps({"ok": True}),
        )
    except Exception as e:
        print(f"[whisper_server] handle_request error: {e}", flush=True)
        return web.Response(
            status=500,
            content_type="application/json",
            text=json.dumps({"error": str(e)}),
        )


SESSIONS_DIR = os.path.join(MEETING_DIR, "sessions")


async def handle_start_session(request: web.Request) -> web.Response:
    try:
        os.makedirs(MEETING_DIR, exist_ok=True)
        from datetime import datetime, timezone, timedelta
        jst = timezone(timedelta(hours=9))
        ts = datetime.now(jst).strftime("%H:%M:%S")
        content = f"[お願い]\n\n[文字起こし]\n=== セッション開始 [{ts}] ===\n"
        with open(CURRENT_FILE, "w", encoding="utf-8") as f:
            f.write(content)
        return web.Response(content_type="application/json", text=json.dumps({"ok": True}))
    except Exception as e:
        return web.Response(status=500, content_type="application/json",
                            text=json.dumps({"error": str(e)}))


async def handle_save_session(request: web.Request) -> web.Response:
    try:
        os.makedirs(SESSIONS_DIR, exist_ok=True)
        if not os.path.exists(CURRENT_FILE):
            return web.Response(content_type="application/json",
                                text=json.dumps({"ok": False, "error": "current.txt not found"}))
        with open(CURRENT_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        if not content.strip():
            return web.Response(content_type="application/json",
                                text=json.dumps({"ok": False, "error": "empty"}))
        from datetime import datetime, timezone, timedelta
        jst = timezone(timedelta(hours=9))
        dt = datetime.now(jst).strftime("%Y-%m-%d_%H-%M")
        filename = f"{dt}.txt"
        filepath = os.path.join(SESSIONS_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return web.Response(content_type="application/json",
                            text=json.dumps({"ok": True, "filename": filename}, ensure_ascii=False))
    except Exception as e:
        return web.Response(status=500, content_type="application/json",
                            text=json.dumps({"error": str(e)}))


async def handle_sessions_list(request: web.Request) -> web.Response:
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    files = sorted(
        [f for f in os.listdir(SESSIONS_DIR) if f.endswith(".txt")],
        reverse=True,
    )
    sessions = []
    for f in files:
        path = os.path.join(SESSIONS_DIR, f)
        preview = ""
        try:
            with open(path, "r", encoding="utf-8") as fp:
                for line in fp:
                    line = line.strip()
                    if line and not line.startswith("[") and not line.startswith("==="):
                        preview = line[:60]
                        break
        except Exception:
            pass
        sessions.append({"filename": f, "preview": preview})
    return web.Response(
        content_type="application/json",
        text=json.dumps({"sessions": sessions}, ensure_ascii=False),
    )


async def handle_session_get(request: web.Request) -> web.Response:
    filename = request.match_info["filename"]
    path = os.path.join(SESSIONS_DIR, filename)
    if not os.path.exists(path):
        return web.Response(status=404, content_type="application/json",
                            text=json.dumps({"error": "Not found"}))
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    return web.Response(
        content_type="application/json",
        text=json.dumps({"content": content}, ensure_ascii=False),
    )


async def handle_session_delete(request: web.Request) -> web.Response:
    filename = request.match_info["filename"]
    path = os.path.join(SESSIONS_DIR, filename)
    if os.path.exists(path):
        os.unlink(path)
    return web.Response(content_type="application/json", text=json.dumps({"ok": True}))


app = web.Application()
app.router.add_post("/transcribe", handle_transcribe)
app.router.add_post("/request", handle_request)
app.router.add_post("/start-session", handle_start_session)
app.router.add_post("/save-session", handle_save_session)
app.router.add_get("/sessions", handle_sessions_list)
app.router.add_get("/sessions/{filename}", handle_session_get)
app.router.add_delete("/sessions/{filename}", handle_session_delete)

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=PORT)
