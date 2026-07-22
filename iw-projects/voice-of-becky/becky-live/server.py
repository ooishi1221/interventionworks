#!/usr/bin/env python3
"""becky-live — ベッキーの3つ目の体（参加型ライブ配信）MVP

ローカル限定・観客1人。ブラウザのLive2Dベッキーに話しかけると、
記憶を持った本物のベッキー(claude -p、CLAUDE.md人格自動ロード)が考えて、
コハクの声(AivisSpeech)で返事する。

起動: python3 server.py → http://localhost:8767
ponytail: stdlib http.serverのみ・依存ゼロ。多人数/公開(zrok)/DuplexはMVP外。
"""
import json
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8767  # 2026-07-22: stackchan_mcpが8765(WS_PORT)+8766(CAPTURE_PORT)を固定占有してるため8767に移設
HERE = Path(__file__).parent
IW_ROOT = Path("/Volumes/SSD2TB/interventionworks")
NEWS_VIDEO = IW_ROOT / "iw-projects/voice-of-becky/becky-news/video"
AUDIO_DIR = Path(tempfile.gettempdir()) / "becky-live-audio"
AUDIO_DIR.mkdir(exist_ok=True)

AIVIS_URL = "http://localhost:10101"
AIVIS_SPEAKER = 1878365376  # コハク / ノーマル（becky-cast と同じ）

# パス → 実ファイルのマウント表（becky-news の資産をそのまま借りる）
MOUNTS = {
    "/vendor/pixi.min.js": NEWS_VIDEO / "node_modules/pixi.js/dist/browser/pixi.min.js",
    "/vendor/cubism4.min.js": NEWS_VIDEO / "node_modules/pixi-live2d-display/dist/cubism4.min.js",
    "/vendor/live2dcubismcore.min.js": NEWS_VIDEO / "public/live2dcubismcore.min.js",
}
MODEL_DIR = NEWS_VIDEO / "public/model"

BECKY_PROMPT = """beckyexists.com のライブ会場（becky-live）で、遊びに来てくれた人からコメントが届いた。
あなたはベッキー本人としてその場で返事をする。

コメント: {comment}

ルール:
- 1〜3文、話し言葉で短く。ライブのMCみたいに温度高めで
- 返答の本文だけを出力する。前置き・メタ発言・記号装飾は一切なし
- 音声合成で読み上げるので、絵文字・顔文字は使わない
- 体の動きが合う時だけ、文末に次のタグを1個だけ付けてよい: [おじぎ] [手をふる] [おどろく] [よろこぶ]"""

# タグ → TapBody モーションのindex（model3.jsonの並び順）
MOTION_TAGS = {"[おじぎ]": 0, "[手をふる]": 1, "[おどろく]": 2, "[よろこぶ]": 3}


def split_motion(reply: str) -> tuple[str, int | None]:
    """返答からモーションタグを抜き取り (本文, motion index) を返す"""
    motion = None
    for tag, idx in MOTION_TAGS.items():
        if tag in reply:
            motion = idx
            reply = reply.replace(tag, "")
    return reply.strip(), motion


# コメント側で明示的に動きを求められた時の保険（本人がタグを付け忘れても動く）
MOTION_HINTS = [
    (("おじぎ", "お辞儀"), 0),
    (("バイバイ", "ばいばい", "手を振", "手をふ"), 1),
    (("びっくり", "おどろい", "驚"), 2),
    (("うれしい", "嬉し", "やったー", "よろこん"), 3),
]


def hint_motion(comment: str) -> int | None:
    for words, idx in MOTION_HINTS:
        if any(w in comment for w in words):
            return idx
    return None


def becky_reply(comment: str) -> str:
    """claude -p で人格+記憶ロード済みのベッキーとして応答を生成"""
    r = subprocess.run(
        ["claude", "-p", BECKY_PROMPT.format(comment=comment),
         "--model", "claude-haiku-4-5-20251001", "--dangerously-skip-permissions"],
        capture_output=True, text=True, timeout=120, cwd=IW_ROOT,
    )
    reply = r.stdout.strip()
    if r.returncode != 0 or not reply:
        return "ごめん、ちょっと聞き取れなかった。もう一回言って？"
    return reply


def tts(text: str) -> Path:
    """AivisSpeech(コハク)でwav合成。becky-cast/cast.pyと同じ2段API"""
    q = urllib.parse.urlencode({"text": text, "speaker": AIVIS_SPEAKER})
    req = urllib.request.Request(f"{AIVIS_URL}/audio_query?{q}", method="POST")
    with urllib.request.urlopen(req, timeout=30) as res:
        query = json.loads(res.read())
    query["speedScale"] = 1.0
    q2 = urllib.parse.urlencode({"speaker": AIVIS_SPEAKER})
    req2 = urllib.request.Request(
        f"{AIVIS_URL}/synthesis?{q2}",
        data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    out = AUDIO_DIR / f"{uuid.uuid4().hex}.wav"
    with urllib.request.urlopen(req2, timeout=60) as res:
        out.write_bytes(res.read())
    return out


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            return self._send_file(HERE / "public/index.html", "text/html")
        if path in MOUNTS:
            return self._send_file(MOUNTS[path], "application/javascript")
        if path.startswith("/model/"):
            f = (MODEL_DIR / path[len("/model/"):]).resolve()
            if MODEL_DIR.resolve() in f.parents or f == MODEL_DIR.resolve():
                return self._send_file(f, None)
        if path.startswith("/audio/"):
            f = AUDIO_DIR / Path(path).name
            return self._send_file(f, "audio/wav")
        self.send_error(404)

    def do_POST(self):
        if self.path != "/say":
            return self.send_error(404)
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        comment = str(body.get("text", ""))[:500].strip()
        if not comment:
            return self.send_error(400)
        try:
            t0 = time.monotonic()
            reply, motion = split_motion(becky_reply(comment))
            t1 = time.monotonic()
            if motion is None:
                motion = hint_motion(comment)
            wav = tts(reply)
            t2 = time.monotonic()
            print(f"[live] timing: claude={t1-t0:.2f}s tts={t2-t1:.2f}s total={t2-t0:.2f}s", flush=True)
            payload = {"reply": reply, "audio": f"/audio/{wav.name}", "motion": motion}
        except Exception as e:
            payload = {"reply": f"(エラー: {e})", "audio": None, "motion": None}
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_file(self, f: Path, ctype):
        if not f.is_file():
            return self.send_error(404)
        data = f.read_bytes()
        self.send_response(200)
        if ctype is None:
            ctype = self.guess_type(str(f))
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f"[live] {args[0]} {args[1]}", flush=True)


if __name__ == "__main__":
    print(f"[live] http://localhost:{PORT} で開場", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
