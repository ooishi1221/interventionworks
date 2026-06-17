#!/usr/bin/env python3
"""ベッキーシステム ヘルスチェックサーバー"""
import subprocess
import requests
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timezone

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

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
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
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # アクセスログ抑制

if __name__ == "__main__":
    print(f"ヘルスチェックサーバー起動: http://localhost:{PORT}/health")
    HTTPServer(("", PORT), HealthHandler).serve_forever()
