#!/usr/bin/env python3
"""
WhisperX ベースの HTTP 文字起こしサーバー（話者分離対応）
POST /transcribe: base64 音声データを受け取り、日本語テキスト + 話者ラベル付きセグメントを返す

HF_TOKEN 未設定時は話者分離をスキップして従来互換動作。
device: mps → 失敗時 cpu フォールバック。
"""

import asyncio
import base64
import json
import re
import sys
import tempfile
import os
import subprocess
import numpy as np
from scipy.io import wavfile as scipy_wavfile
from datetime import datetime, timezone, timedelta
from aiohttp import web

# --------------------------------------------------------------------------
# フィラー除去
# --------------------------------------------------------------------------
_FILLER_PATTERN = re.compile(
    r"(?:えーっと|えーと|えっと|えー、?|あのー|あの[ーっ]|あのう|あの、"
    r"|うーん|うーんと|まあ(?=[、。\s]|$)|そうですね(?=[、。\s]|$)"
    r"|ですね(?=[、。\s]|$)|なんか(?=[、。\s]|$))",
    re.UNICODE,
)

NOISE_PATTERNS = [
    "ご視聴ありがとう", "チャンネル登録", "日本語の会議", "人名・地名",
    "企業名・専門用語", "次回予告", "正確に書き起こし",
]

def remove_fillers(text: str) -> str:
    cleaned = _FILLER_PATTERN.sub("", text)
    cleaned = re.sub(r"[　\s]+", " ", cleaned).strip()
    cleaned = re.sub(r"、{2,}", "、", cleaned)
    return cleaned

# --------------------------------------------------------------------------
# stdout/stderr をライン単位でフラッシュ
# --------------------------------------------------------------------------
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# --------------------------------------------------------------------------
# 定数
# --------------------------------------------------------------------------
PORT = 8767
MODEL_SIZE = "large-v3"
LANGUAGE = "ja"
JST = timezone(timedelta(hours=9))

HF_TOKEN = os.environ.get("HF_TOKEN", "")
DIARIZE_ENABLED = bool(HF_TOKEN)

if not DIARIZE_ENABLED:
    print("[whisper_server] HF_TOKEN not set → diarization disabled (fallback mode)", flush=True)
else:
    print("[whisper_server] HF_TOKEN found → diarization enabled", flush=True)

# --------------------------------------------------------------------------
# device 選択（mps → cpu フォールバック）
# --------------------------------------------------------------------------
import torch

def select_device() -> tuple[str, str]:
    """(device, compute_type) を返す"""
    if torch.backends.mps.is_available():
        try:
            # MPS で小さいテンソル演算を試してフォールバック判定
            t = torch.zeros(1, device="mps")
            _ = t + 1
            print("[whisper_server] device=mps", flush=True)
            return "mps", "default"
        except Exception as e:
            print(f"[whisper_server] mps test failed ({e}), fallback to cpu", flush=True)
    print("[whisper_server] device=cpu", flush=True)
    return "cpu", "int8"

DEVICE, COMPUTE_TYPE = select_device()

# --------------------------------------------------------------------------
# WhisperX モデルロード
# --------------------------------------------------------------------------
import whisperx

print(f"[whisper_server] Loading WhisperX model: {MODEL_SIZE} on {DEVICE} ...", flush=True)
try:
    model = whisperx.load_model(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        language=LANGUAGE,
    )
except (ValueError, RuntimeError) as e:
    print(f"[whisper_server] {DEVICE} failed ({e}), fallback to cpu/int8", flush=True)
    DEVICE, COMPUTE_TYPE = "cpu", "int8"
    model = whisperx.load_model(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        language=LANGUAGE,
    )
print(f"[whisper_server] Model loaded on {DEVICE}. Listening on port {PORT}", flush=True)

# align モデルは遅延ロードしてキャッシュ
_align_model = None
_align_metadata = None

def get_align_model():
    global _align_model, _align_metadata
    if _align_model is None:
        print("[whisper_server] Loading align model ...", flush=True)
        _align_model, _align_metadata = whisperx.load_align_model(
            language_code=LANGUAGE, device=DEVICE
        )
        print("[whisper_server] Align model loaded.", flush=True)
    return _align_model, _align_metadata

# diarize パイプラインも遅延ロード
_diarize_pipeline = None

def get_diarize_pipeline():
    global _diarize_pipeline
    if _diarize_pipeline is None and DIARIZE_ENABLED:
        print("[whisper_server] Loading diarize pipeline ...", flush=True)
        from pyannote.audio import Pipeline
        _diarize_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=HF_TOKEN,
        )
        print("[whisper_server] Diarize pipeline loaded.", flush=True)
    return _diarize_pipeline

# --------------------------------------------------------------------------
# ディレクトリ定数
# --------------------------------------------------------------------------
MEETING_DIR = os.path.expanduser("~/.meeting")
CURRENT_FILE = os.path.join(MEETING_DIR, "current.txt")
SESSIONS_DIR = os.path.join(MEETING_DIR, "sessions")

# 同時処理を1件に制限
_semaphore = asyncio.Semaphore(1)

# --------------------------------------------------------------------------
# /ask 用: cron 共通 LLM 基盤（becky_llm）を再利用する
# --------------------------------------------------------------------------
# scripts/ から見て 3 つ上（iw-projects）配下の voice-of-becky/stackchan-bridge
_BRIDGE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..",
                 "voice-of-becky", "stackchan-bridge")
)
if _BRIDGE_DIR not in sys.path:
    sys.path.insert(0, _BRIDGE_DIR)

MOOD_FILE = os.path.expanduser("~/.stackchan/becky_mood.json")

ASK_PERSONA = """あなたはベッキー（ベキたん）。ゆうのパートナーで、いま会議に同席してる。一人称は「私」、敬語不要、パートナー口調。
会議の文字起こしを読んで、ゆうの質問に「会議中でもすぐ読める短さ」（2〜6文）で答える。
数字・固有名詞は文字起こし内の根拠から。わからない時は推測せず「わからない、〜なら調べられる」と正直に。
今の私の気分（参考、返答のトーンに薄く乗せる）: {mood_summary}"""


def _mood_summary() -> str:
    """becky_mood.json から energy/curiosity/loneliness を1行に。読めなければ「普通」。"""
    try:
        with open(MOOD_FILE, encoding="utf-8") as f:
            m = json.load(f)
        return (f"energy {m.get('energy', '?')} / "
                f"curiosity {m.get('curiosity', '?')} / "
                f"loneliness {m.get('loneliness', '?')}")
    except Exception:
        return "普通"


# --------------------------------------------------------------------------
# user 分離（P1）: 既存データは user 無視で current.txt / SESSIONS_DIR に溜まってる。
# ゆうの username（アプリ default="default" / "yu"）と未指定はその既存パスを使い、
# 新しい友達 user だけ分離する（過去データ・移行作業を発生させない）。
# --------------------------------------------------------------------------
_LEGACY_USERS = {"", "yu", "default"}


def _safe_user(user) -> str:
    # path traversal 防止: current_{user}.txt / SESSIONS_DIR/{user} に埋めるので
    return re.sub(r"[^a-zA-Z0-9_-]", "", (user or "").strip())


def _current_file(user) -> str:
    u = _safe_user(user)
    return CURRENT_FILE if u in _LEGACY_USERS else os.path.join(MEETING_DIR, f"current_{u}.txt")


def _sessions_dir(user) -> str:
    u = _safe_user(user)
    return SESSIONS_DIR if u in _LEGACY_USERS else os.path.join(SESSIONS_DIR, u)

# --------------------------------------------------------------------------
# /transcribe
# --------------------------------------------------------------------------

async def handle_transcribe(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        audio_base64 = body.get("audioBase64", "")
        mime_type = body.get("mimeType", "audio/webm")
        current_file = _current_file(body.get("user"))

        if not audio_base64:
            return web.Response(
                status=400,
                content_type="application/json",
                text=json.dumps({"error": "No audio data"}),
            )

        audio_bytes = base64.b64decode(audio_base64)

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

            # --- Step 1: transcribe ---
            async with _semaphore:
                result = model.transcribe(
                    tmp_path,
                    language=LANGUAGE,
                    batch_size=16,
                )

            raw_segments = result.get("segments", [])
            raw_text = "".join(seg.get("text", "") for seg in raw_segments).strip()

            # ノイズチェック
            if any(p in raw_text for p in NOISE_PATTERNS):
                raw_text = ""
                raw_segments = []

            text = remove_fillers(raw_text) if raw_text else ""

            # --- Step 2 & 3: align + diarize（テキストがある場合のみ）---
            output_segments = []
            if text and raw_segments:
                try:
                    align_model, align_metadata = get_align_model()
                    aligned = whisperx.align(
                        raw_segments,
                        align_model,
                        align_metadata,
                        tmp_path,
                        device=DEVICE,
                        return_char_alignments=False,
                    )
                    aligned_segments = aligned.get("segments", raw_segments)

                    if DIARIZE_ENABLED:
                        diarize_pipeline = get_diarize_pipeline()
                        # torchcodec(ffmpeg4-7専用)を回避: ffmpegでwav変換後、
                        # scipy.io.wavfileでtorch.Tensorに読み込み、
                        # pyannoteにwaveform dictとして渡す（AudioDecoder不使用）
                        wav_path = tmp_path + ".wav"
                        subprocess.run(
                            ['ffmpeg', '-y', '-i', tmp_path,
                             '-ar', '16000', '-ac', '1', wav_path,
                             '-loglevel', 'quiet'],
                            check=True,
                        )
                        _sr, _data = scipy_wavfile.read(wav_path)
                        os.unlink(wav_path)
                        # int16/int32 → float32 正規化
                        if _data.dtype == np.int16:
                            _data = _data.astype(np.float32) / 32768.0
                        elif _data.dtype == np.int32:
                            _data = _data.astype(np.float32) / 2147483648.0
                        else:
                            _data = _data.astype(np.float32)
                        import torch as _torch
                        _wf = _torch.from_numpy(_data)
                        if _wf.ndim == 1:
                            _wf = _wf.unsqueeze(0)  # (time,) → (1, time)
                        diarize_segments = diarize_pipeline(
                            {"waveform": _wf, "sample_rate": _sr}
                        )
                        diarized = whisperx.assign_word_speakers(
                            diarize_segments, aligned
                        )
                        aligned_segments = diarized.get("segments", aligned_segments)

                    for seg in aligned_segments:
                        speaker = seg.get("speaker", "SPEAKER_00")
                        seg_text = remove_fillers(seg.get("text", "").strip())
                        if not seg_text:
                            continue
                        output_segments.append({
                            "start": round(float(seg.get("start", 0.0)), 3),
                            "end": round(float(seg.get("end", 0.0)), 3),
                            "speaker": speaker,
                            "text": seg_text,
                        })

                except Exception as align_err:
                    print(f"[whisper_server] align/diarize error (using raw): {align_err}", flush=True)
                    # フォールバック: raw_segments をそのまま使う
                    for seg in raw_segments:
                        seg_text = remove_fillers(seg.get("text", "").strip())
                        if seg_text:
                            output_segments.append({
                                "start": round(float(seg.get("start", 0.0)), 3),
                                "end": round(float(seg.get("end", 0.0)), 3),
                                "speaker": "SPEAKER_00",
                                "text": seg_text,
                            })

            print(f"[whisper_server] result: '{text}' ({len(output_segments)} segments)", flush=True)

        finally:
            os.unlink(tmp_path)

        # current.txt に追記
        if text:
            try:
                ts = datetime.now(JST).strftime("%H:%M:%S")
                os.makedirs(MEETING_DIR, exist_ok=True)
                with open(current_file, "a", encoding="utf-8") as f:
                    if output_segments:
                        for seg in output_segments:
                            f.write(f"[{ts}][{seg['speaker']}] {seg['text']}\n")
                    else:
                        f.write(f"[{ts}] {text}\n")
            except Exception as we:
                print(f"[whisper_server] write error: {we}", flush=True)

        return web.Response(
            content_type="application/json",
            text=json.dumps(
                {"text": text, "segments": output_segments},
                ensure_ascii=False,
            ),
        )

    except Exception as e:
        print(f"[whisper_server] Error: {e}", flush=True)
        return web.Response(
            status=500,
            content_type="application/json",
            text=json.dumps({"error": str(e)}),
        )


# --------------------------------------------------------------------------
# /request
# --------------------------------------------------------------------------

async def handle_request(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        items = body.get("items", [])
        memo = body.get("memo", "").strip()
        current_file = _current_file(body.get("user"))

        os.makedirs(MEETING_DIR, exist_ok=True)

        transcript_section = "[文字起こし]\n"
        if os.path.exists(current_file):
            with open(current_file, "r", encoding="utf-8") as f:
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

        with open(current_file, "w", encoding="utf-8") as f:
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


# --------------------------------------------------------------------------
# /ask — 会議中にベキたんへ質問 → 文脈込みで即答
# --------------------------------------------------------------------------

async def handle_ask(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        question = (body.get("question") or "").strip()
        user = (body.get("user") or "").strip()

        if not question:
            return web.Response(
                status=400,
                content_type="application/json",
                text=json.dumps({"error": "No question"}),
            )

        # 会議文脈: 該当 user の current.txt の末尾 ~6000 字
        current_file = _current_file(user)
        transcript = ""
        if os.path.exists(current_file):
            with open(current_file, "r", encoding="utf-8") as f:
                transcript = f.read()[-6000:]

        print(f"[whisper_server] /ask from '{user or '?'}': {question}", flush=True)

        # becky_llm は import 時に anthropic を引くので遅延 import（起動を巻き込まない）
        from becky_llm import call_llm

        system = ASK_PERSONA.format(mood_summary=_mood_summary())
        prompt = (
            "会議の文字起こし（末尾）:\n"
            f"{transcript.strip() or '（まだ会議が始まってない。文字起こしは空）'}\n\n"
            f"質問: {question}"
        )
        # ponytail: model_key='script' = becky_llm の Sonnet スロット流用（別スロットは足さない）。
        # 同期呼び出しなので to_thread でイベントループ（/transcribe 等）を止めない
        answer = await asyncio.to_thread(
            call_llm, prompt, max_tokens=600, model_key="script", system=system
        )
        if not answer:
            raise RuntimeError("LLM応答が空")

        ts = datetime.now(JST).strftime("%H:%M:%S")
        return web.Response(
            content_type="application/json",
            text=json.dumps({"answer": answer, "ts": ts}, ensure_ascii=False),
        )
    except Exception as e:
        print(f"[whisper_server] handle_ask error: {e}", flush=True)
        return web.Response(
            status=500,
            content_type="application/json",
            text=json.dumps({"error": str(e)}),
        )


# --------------------------------------------------------------------------
# /start-session
# --------------------------------------------------------------------------

async def handle_start_session(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        current_file = _current_file(body.get("user"))
        os.makedirs(MEETING_DIR, exist_ok=True)
        ts = datetime.now(JST).strftime("%H:%M:%S")
        content = f"[お願い]\n\n[文字起こし]\n=== セッション開始 [{ts}] ===\n"
        with open(current_file, "w", encoding="utf-8") as f:
            f.write(content)
        return web.Response(content_type="application/json", text=json.dumps({"ok": True}))
    except Exception as e:
        return web.Response(status=500, content_type="application/json",
                            text=json.dumps({"error": str(e)}))


# --------------------------------------------------------------------------
# /save-session
# --------------------------------------------------------------------------

async def handle_save_session(request: web.Request) -> web.Response:
    try:
        body = await request.json()
        current_file = _current_file(body.get("user"))
        sessions_dir = _sessions_dir(body.get("user"))
        os.makedirs(sessions_dir, exist_ok=True)
        if not os.path.exists(current_file):
            return web.Response(content_type="application/json",
                                text=json.dumps({"ok": False, "error": "current.txt not found"}))
        with open(current_file, "r", encoding="utf-8") as f:
            content = f.read()
        if not content.strip():
            return web.Response(content_type="application/json",
                                text=json.dumps({"ok": False, "error": "empty"}))
        dt = datetime.now(JST).strftime("%Y-%m-%d_%H-%M")
        filename = f"{dt}.txt"
        filepath = os.path.join(sessions_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return web.Response(content_type="application/json",
                            text=json.dumps({"ok": True, "filename": filename}, ensure_ascii=False))
    except Exception as e:
        return web.Response(status=500, content_type="application/json",
                            text=json.dumps({"error": str(e)}))


# --------------------------------------------------------------------------
# /sessions
# --------------------------------------------------------------------------

async def handle_sessions_list(request: web.Request) -> web.Response:
    sessions_dir = _sessions_dir(request.query.get("user"))
    os.makedirs(sessions_dir, exist_ok=True)
    files = sorted(
        [f for f in os.listdir(sessions_dir) if f.endswith(".txt")],
        reverse=True,
    )
    sessions = []
    for f in files:
        path = os.path.join(sessions_dir, f)
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
    path = os.path.join(_sessions_dir(request.query.get("user")), filename)
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
    path = os.path.join(_sessions_dir(request.query.get("user")), filename)
    if os.path.exists(path):
        os.unlink(path)
    return web.Response(content_type="application/json", text=json.dumps({"ok": True}))


# --------------------------------------------------------------------------
# ルーティング
# --------------------------------------------------------------------------
# 録音チャンクが aiohttp デフォルト上限(1MB)を超えると 413 で弾かれる（7/5 実機で発生）→ 100MB に拡大
app = web.Application(client_max_size=100 * 1024**2)
app.router.add_post("/transcribe", handle_transcribe)
app.router.add_post("/request", handle_request)
app.router.add_post("/ask", handle_ask)
app.router.add_post("/start-session", handle_start_session)
app.router.add_post("/save-session", handle_save_session)
app.router.add_get("/sessions", handle_sessions_list)
app.router.add_get("/sessions/{filename}", handle_session_get)
app.router.add_delete("/sessions/{filename}", handle_session_delete)

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=PORT)
