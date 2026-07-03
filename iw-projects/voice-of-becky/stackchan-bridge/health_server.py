#!/usr/bin/env python3
"""ベッキーシステム ヘルスチェックサーバー"""
import subprocess
import requests
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timezone
import socket

SERVICES = [
    {"name": "aituber-onair",  "port": 5180,  "desc": "Live2D配信"},
    {"name": "metameta",        "port": 8888,  "desc": "1on1分析ツール"},
    {"name": "health_server",   "port": 9001,  "desc": "Observer"},
    {"name": "whisper_server",  "port": 8767,  "desc": "文字起こし"},
    {"name": "AivisSpeech",     "port": 10101, "desc": "TTS"},
    {"name": "Applio",          "port": 6969,  "desc": "RVC学習"},
    {"name": "VC Client",       "port": 18000, "desc": "VC変換"},
    {"name": "n8n",             "port": 5678,  "desc": "ワークフロー"},
]

def check_services() -> dict:
    results = []
    for svc in SERVICES:
        try:
            with socket.create_connection(("127.0.0.1", svc["port"]), timeout=0.3):
                running = True
        except (OSError, ConnectionRefusedError):
            running = False
        results.append({
            "name": svc["name"],
            "port": svc["port"],
            "desc": svc["desc"],
            "running": running,
        })
    return {
        "checked_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "services": results,
    }

PORT = 9001

def check_process(name: str) -> dict:
    result = subprocess.run(["pgrep", "-f", name], capture_output=True, text=True)
    running = result.returncode == 0
    pids = result.stdout.strip().split("\n") if running else []
    return {"status": "ok" if running else "down", "pids": pids}

def check_aivis() -> dict:
    try:
        r = requests.get("http://localhost:10101/speakers", timeout=3)
        return {"status": "ok", "code": r.status_code}
    except Exception as e:
        return {"status": "down", "error": str(e)}

def check_morning_cast_log() -> dict:
    out_dir = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/becky-cast/out")
    eps = sorted(out_dir.glob("ep-*.mp3")) if out_dir.exists() else []
    if not eps:
        return {"status": "unknown", "note": "出力ファイルなし"}
    latest = eps[-1]
    mtime = latest.stat().st_mtime
    age_hours = (time.time() - mtime) / 3600
    status = "ok" if age_hours < 25 else "stale"
    ts = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
    return {"status": status, "last_episode": latest.name, "last_run": ts, "age_hours": round(age_hours, 1)}

MOOD_FILE = Path.home() / ".stackchan" / "becky_mood.json"

def fmt_schedule(m: str, h: str, dow: str) -> str:
    if m.startswith("*/"):
        return f"毎時 :{m[2:]}分毎"
    if h == "*" and m == "0":
        return "毎時 :00"
    if dow == "0":
        return f"日曜 {h.zfill(2)}:{m.zfill(2)}"
    if "," in h:
        times = " / ".join(f"{x.zfill(2)}:{m.zfill(2)}" for x in h.split(","))
        return f"毎日 {times}"
    if "," in m:
        times = " / ".join(f"{h.zfill(2)}:{x.zfill(2)}" for x in m.split(","))
        return f"毎日 {times}"
    if h != "*":
        return f"毎日 {h.zfill(2)}:{m.zfill(2)}"
    return f"{m} {h} * * {dow}"

def parse_crontab() -> list:
    import re as re_
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    lines = result.stdout.strip().split("\n")
    jobs, pending = [], None
    for line in lines:
        s = line.strip()
        if not s:
            pending = None; continue
        if s.startswith("#"):
            pending = s[1:].strip(); continue
        parts = s.split(None, 5)
        if len(parts) < 6:
            pending = None; continue
        m, h, dom, mon, dow, cmd = parts
        match = re_.search(r'(\w[\w-]*\.py)', cmd)
        if match:
            label = match.group(1)
        elif pending:
            label = pending.split("—")[0].split("（")[0].strip().split()[0]
        else:
            label = cmd.split()[-1].split("/")[-1]
        jobs.append({
            "cron": f"{m} {h} {dom} {mon} {dow}",
            "schedule": fmt_schedule(m, h, dow),
            "label": label,
            "description": pending or "",
        })
        pending = None
    return jobs

def load_mood() -> dict:
    try:
        return json.loads(MOOD_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/crons":
            body = json.dumps(parse_crontab(), ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/memos":
            memo_file = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/memos_from_yu.json")
            obj = json.loads(memo_file.read_text(encoding="utf-8")) if memo_file.exists() else {"memos": []}
            body = json.dumps(obj, ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/task_comments":
            tc_file = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/task_comments.json")
            obj = json.loads(tc_file.read_text(encoding="utf-8")) if tc_file.exists() else {"comments": []}
            body = json.dumps(obj, ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/mood":
            mood = load_mood()
            body = json.dumps(mood, ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/services":
            data = check_services()
            body = json.dumps(data, ensure_ascii=False, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path not in ("/", "/health"):
            self.send_response(404)
            self.end_headers()
            return

        checks = {
            "observer": check_process("becky_observer.py"),
            "muzu_monitor": check_process("muzu_monitor.py"),
            "aivis_engine": check_aivis(),
            "morning_cast_cron": check_morning_cast_log(),
        }

        all_ok = all(c["status"] == "ok" for c in checks.values())
        overall = "ok" if all_ok else "degraded"

        body = json.dumps({
            "status": overall,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
        }, ensure_ascii=False, indent=2).encode()

        self.send_response(200 if all_ok else 503)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/memo/clear":
            memo_file = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/memos_from_yu.json")
            obj = {"updated_at": datetime.now(timezone.utc).isoformat(), "memos": []}
            memo_file.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
            resp = json.dumps({"ok": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return
        if self.path == "/task_comment":
            length = int(self.headers.get("Content-Length", 0))
            try:
                data = json.loads(self.rfile.read(length).decode("utf-8"))
                task_id = str(data.get("task_id", "")).strip()
                text = str(data.get("text", "")).strip()
            except Exception:
                task_id = text = ""
            if not task_id or not text:
                resp = json.dumps({"ok": False, "error": "task_id and text required"}).encode()
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                return
            tc_file = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/task_comments.json")
            obj = json.loads(tc_file.read_text(encoding="utf-8")) if tc_file.exists() else {"comments": []}
            now = datetime.now(timezone.utc)
            obj["comments"].append({
                "id": f"tc-{int(now.timestamp() * 1000)}",
                "task_id": task_id,
                "from": "yu",
                "text": text,
                "ts": now.isoformat(),
                "read": False,
            })
            obj["updated_at"] = now.isoformat()
            tc_file.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
            resp = json.dumps({"ok": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return
        if self.path != "/memo":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(data.get("text", "")).strip()
            if text:
                memo_file = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/memos_from_yu.json")
                obj = json.loads(memo_file.read_text(encoding="utf-8")) if memo_file.exists() else {"memos": []}
                new_id = f"memo-{int(datetime.now(timezone.utc).timestamp())}"
                obj["memos"].append({"id": new_id, "text": text, "created_at": datetime.now(timezone.utc).isoformat(), "read": False})
                obj["updated_at"] = datetime.now(timezone.utc).isoformat()
                memo_file.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
            resp = json.dumps({"ok": True}).encode()
        except Exception as e:
            resp = json.dumps({"ok": False, "error": str(e)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # アクセスログ抑制

if __name__ == "__main__":
    print(f"ヘルスチェックサーバー起動: http://localhost:{PORT}/health")
    HTTPServer(("", PORT), HealthHandler).serve_forever()
