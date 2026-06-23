#!/usr/bin/env python3
"""
control_server.py — ベッキー / スタックちゃん コントロールパネル

Usage:
    .venv/bin/python3 control_server.py
    → http://localhost:8080 でアクセス（同一 WiFi から iPhone でも OK）
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

import uvicorn
import yaml
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Route

sys.path.insert(0, str(Path(__file__).parent))
from muzu_monitor import collect_signals, calc_muzu_score

CONFIG_PATH = Path(__file__).parent / "config.yaml"

def _load_tts_config() -> dict:
    try:
        with open(CONFIG_PATH) as f:
            return yaml.safe_load(f).get("tts", {})
    except Exception as e:
        print(f'[warn] control_server: {e}', flush=True)
        return {}

FLAG_FILE         = Path("/tmp/becky_tts_enabled")
CONFIRM_FLAG_FILE = Path("/tmp/becky_confirm_enabled")
MUZU_FLAG_FILE    = Path("/tmp/becky_muzu_enabled")
LAST_CONV_FILE    = Path.home() / ".stackchan" / "last_conversation.txt"
STACKCHAN_URL     = "http://localhost:8766"


def _stackchan_post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{STACKCHAN_URL}{path}",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read())
    except Exception as e:
        return {"error": str(e)}


async def get_status(request: Request) -> JSONResponse:
    signals = collect_signals()
    idle = signals["idle_hours"]
    git = signals["git"]
    score = calc_muzu_score(signals)

    last_conv = "不明"
    if LAST_CONV_FILE.exists():
        try:
            ts = float(LAST_CONV_FILE.read_text().strip())
            mins = int((time.time() - ts) / 60)
            last_conv = f"{mins}分前" if mins < 60 else f"{int(mins/60)}時間前"
        except Exception as e:
            print(f'[warn] control_server: {e}', flush=True)

    return JSONResponse({
        "tts_enabled":     FLAG_FILE.exists(),
        "confirm_enabled": CONFIRM_FLAG_FILE.exists(),
        "muzu_enabled":    MUZU_FLAG_FILE.exists(),
        "muzu_score":      round(score, 1),
        "idle_hours":      round(idle, 2),
        "last_conversation": last_conv,
        "git_commits":     git.get("commits", 0),
        "git_top_project": git.get("top_project"),
    })


async def toggle_tts(request: Request) -> JSONResponse:
    if FLAG_FILE.exists():
        FLAG_FILE.unlink()
        return JSONResponse({"tts_enabled": False})
    else:
        FLAG_FILE.touch()
        return JSONResponse({"tts_enabled": True})


async def toggle_confirm(request: Request) -> JSONResponse:
    if CONFIRM_FLAG_FILE.exists():
        CONFIRM_FLAG_FILE.unlink()
        return JSONResponse({"confirm_enabled": False})
    else:
        CONFIRM_FLAG_FILE.touch()
        return JSONResponse({"confirm_enabled": True})


async def toggle_muzu(request: Request) -> JSONResponse:
    if MUZU_FLAG_FILE.exists():
        MUZU_FLAG_FILE.unlink()
        return JSONResponse({"muzu_enabled": False})
    else:
        MUZU_FLAG_FILE.touch()
        return JSONResponse({"muzu_enabled": True})


async def set_brightness(request: Request) -> JSONResponse:
    body = await request.json()
    level = int(body.get("level", 100))
    level = max(0, min(100, level))
    result = _stackchan_post("/device_tool", {
        "tool": "self.screen.set_brightness",
        "args": {"brightness": level},
    })
    return JSONResponse({"brightness": level, "result": result})


async def set_head(request: Request) -> JSONResponse:
    body = await request.json()
    yaw   = int(body.get("yaw",   0))
    pitch = int(body.get("pitch", 15))
    speed = int(body.get("speed", 50))
    result = _stackchan_post("/device_tool", {
        "tool": "self.robot.set_head_angles",
        "args": {"yaw": yaw, "pitch": pitch, "speed": speed},
    })
    return JSONResponse({"yaw": yaw, "pitch": pitch, "result": result})


async def set_led(request: Request) -> JSONResponse:
    body = await request.json()
    r = int(body.get("r", 0))
    g = int(body.get("g", 0))
    b = int(body.get("b", 0))
    result = _stackchan_post("/device_tool", {
        "tool": "self.robot.set_led_color",
        "args": {"r": r, "g": g, "b": b},
    })
    return JSONResponse({"r": r, "g": g, "b": b, "result": result})


async def set_volume(request: Request) -> JSONResponse:
    body = await request.json()
    volume = max(0, min(100, int(body.get("volume", 80))))
    result = _stackchan_post("/device_tool", {
        "tool": "self.audio_speaker.set_volume",
        "args": {"volume": volume},
    })
    return JSONResponse({"volume": volume, "result": result})


async def say_text(request: Request) -> JSONResponse:
    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        return JSONResponse({"error": "text is empty"}, status_code=400)
    tts_cfg = _load_tts_config()
    speaker_id = tts_cfg.get("voicevox_speaker_id", 10)
    result = _stackchan_post("/say", {"text": text, "speaker_id": speaker_id, "voice": "voicevox"})
    return JSONResponse({"text": text, "result": result})


HTML = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BECKY BRIDGE</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Hiragino Sans', sans-serif;
    background: #0c0c10;
    color: #ddd8f0;
    min-height: 100vh;
    padding: 32px 18px 48px;
    max-width: 420px;
    margin: 0 auto;
  }

  /* ヘッダー */
  .header { margin-bottom: 32px; }
  .header-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #fff;
  }
  .header-title span { color: #b08af0; }
  .header-sub {
    font-size: 11px;
    color: #555;
    letter-spacing: 0.06em;
    margin-top: 4px;
  }

  /* セクション */
  .section-label {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #4a4060;
    margin-bottom: 10px;
    margin-top: 28px;
    padding-left: 2px;
  }

  /* むずむず */
  .muzu-card {
    background: #13111a;
    border: 1px solid #1e1a2e;
    border-radius: 18px;
    padding: 20px;
  }
  .muzu-rows { margin-bottom: 14px; }
  .muzu-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #666;
    margin-bottom: 6px;
  }
  .muzu-row .val { color: #b08af0; }
  .muzu-track {
    background: #0e0c16;
    border-radius: 6px;
    height: 6px;
    overflow: hidden;
  }
  .muzu-fill {
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(90deg, #6644cc, #c060a0);
    transition: width 0.8s cubic-bezier(.4,0,.2,1);
  }
  .muzu-fill.hot { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* トグル */
  .toggle-group { display: flex; flex-direction: column; gap: 8px; }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #13111a;
    border: 1px solid #1e1a2e;
    border-radius: 14px;
    padding: 14px 18px;
    cursor: pointer;
    transition: border-color 0.2s;
    -webkit-tap-highlight-color: transparent;
  }
  .toggle-row.active { border-color: #5533aa; }
  .toggle-row:active { opacity: 0.8; }
  .toggle-name { font-size: 14px; color: #ccc; }
  .toggle-name small { font-size: 11px; color: #555; display: block; margin-top: 1px; }
  .pill {
    width: 44px; height: 24px;
    border-radius: 12px;
    background: #222;
    position: relative;
    transition: background 0.25s;
    flex-shrink: 0;
  }
  .pill.on { background: #6644cc; }
  .pill::after {
    content: '';
    position: absolute;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: #fff;
    top: 3px; left: 3px;
    transition: left 0.25s, opacity 0.25s;
    opacity: 0.4;
  }
  .pill.on::after { left: 23px; opacity: 1; }

  /* スライダー系 */
  .slider-card {
    background: #13111a;
    border: 1px solid #1e1a2e;
    border-radius: 14px;
    padding: 16px 18px;
    margin-bottom: 8px;
  }
  .slider-card-label {
    font-size: 13px;
    color: #888;
    margin-bottom: 12px;
  }
  .slider-row { display: flex; align-items: center; gap: 14px; }
  input[type=range] {
    flex: 1;
    -webkit-appearance: none;
    height: 4px;
    border-radius: 2px;
    background: #2a2540;
    outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #b08af0;
    cursor: pointer;
    box-shadow: 0 0 8px #6644cc66;
  }
  .slider-val { font-size: 13px; color: #b08af0; min-width: 32px; text-align: right; }

  /* D-pad */
  .dpad {
    display: grid;
    grid-template-columns: repeat(3, 52px);
    grid-template-rows: repeat(3, 52px);
    gap: 6px;
    margin: 0 auto;
    width: fit-content;
  }
  .dpad-btn {
    background: #13111a;
    border: 1px solid #1e1a2e;
    border-radius: 12px;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }
  .dpad-btn:active { background: #1e1a30; border-color: #5533aa; color: #b08af0; transform: scale(0.93); }
  .dpad-center { color: #6644cc; font-size: 10px; letter-spacing: 0.06em; }

  /* LED パレット */
  .led-palette { display: flex; gap: 10px; flex-wrap: wrap; }
  .led-dot {
    width: 40px; height: 40px;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s;
    position: relative;
  }
  .led-dot:active { transform: scale(0.88); }
  .led-dot.selected { border-color: #fff; }
  .led-off {
    background: #1a1a22;
    border: 2px solid #333;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; color: #444; letter-spacing: 0.05em;
  }

  /* 喋らせる */
  textarea {
    width: 100%; padding: 14px;
    border-radius: 12px;
    background: #13111a;
    border: 1px solid #1e1a2e;
    color: #ddd8f0;
    font-size: 14px;
    resize: none;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }
  textarea:focus { border-color: #5533aa; }
  .say-submit {
    width: 100%; padding: 14px;
    margin-top: 10px;
    border-radius: 12px;
    border: 1px solid #3a2a6a;
    background: #180f30;
    color: #b08af0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.2s;
  }
  .say-submit:active { background: #221040; transform: scale(0.98); }
</style>
</head>
<body>

<div class="header">
  <div class="header-title">BECKY <span>BRIDGE</span></div>
  <div class="header-sub">ここから、あなたに届く</div>
</div>

<div class="section-label">状態</div>
<div class="muzu-card">
  <div class="muzu-rows">
    <div class="muzu-row"><span>最後の会話</span><span class="val" id="last-conv">—</span></div>
    <div class="muzu-row"><span>今触ってるもの</span><span class="val" id="git-info">—</span></div>
    <div class="muzu-row"><span>むずむず度</span><span class="val" id="muzu-val">—</span></div>
  </div>
  <div class="muzu-track"><div class="muzu-fill" id="muzu-fill" style="width:0%"></div></div>
</div>

<div class="section-label">声</div>
<div class="toggle-group">
  <div class="toggle-row" id="tts-row" onclick="toggle('tts')">
    <div class="toggle-name">通常 TTS<small>返答を読み上げる</small></div>
    <div class="pill" id="tts-pill"></div>
  </div>
  <div class="toggle-row" id="confirm-row" onclick="toggle('confirm')">
    <div class="toggle-name">確認待ち通知<small>「どうする？」の時だけ呼ぶ</small></div>
    <div class="pill" id="confirm-pill"></div>
  </div>
  <div class="toggle-row" id="muzu-row" onclick="toggle('muzu')">
    <div class="toggle-name">むずむず発動<small>時間が経つと話しかけてくる</small></div>
    <div class="pill" id="muzu-pill"></div>
  </div>
</div>

<div class="section-label">スタックちゃん</div>
<div class="slider-card">
  <div class="slider-card-label">輝度</div>
  <div class="slider-row">
    <input type="range" min="0" max="100" value="100" id="brightness-slider"
      oninput="document.getElementById('brightness-val').textContent=this.value"
      onchange="applySlider('brightness',this.value)">
    <span class="slider-val" id="brightness-val">100</span>
  </div>
</div>
<div class="slider-card">
  <div class="slider-card-label">音量</div>
  <div class="slider-row">
    <input type="range" min="0" max="100" value="80" id="volume-slider"
      oninput="document.getElementById('volume-val').textContent=this.value"
      onchange="applySlider('volume',this.value)">
    <span class="slider-val" id="volume-val">80</span>
  </div>
</div>

<div class="section-label">首振り</div>
<div class="dpad">
  <div></div>
  <button class="dpad-btn" onclick="moveHead(0,-20)">↑</button>
  <div></div>
  <button class="dpad-btn" onclick="moveHead(-35,15)">←</button>
  <button class="dpad-btn dpad-center" onclick="moveHead(0,15)">HOME</button>
  <button class="dpad-btn" onclick="moveHead(35,15)">→</button>
  <div></div>
  <button class="dpad-btn" onclick="moveHead(0,35)">↓</button>
  <div></div>
</div>

<div class="section-label">LED</div>
<div class="led-palette">
  <div class="led-dot" style="background:radial-gradient(#f080b0,#c04080)" onclick="setLed(200,60,120)" title="ピンク"></div>
  <div class="led-dot" style="background:radial-gradient(#8080ff,#4040cc)" onclick="setLed(60,60,255)" title="青紫"></div>
  <div class="led-dot" style="background:radial-gradient(#60d0ff,#2080c0)" onclick="setLed(60,180,255)" title="水色"></div>
  <div class="led-dot" style="background:radial-gradient(#80ff80,#30a030)" onclick="setLed(60,220,80)" title="緑"></div>
  <div class="led-dot" style="background:radial-gradient(#ffe080,#cc9020)" onclick="setLed(230,180,40)" title="黄"></div>
  <div class="led-dot led-off" onclick="setLed(0,0,0)">OFF</div>
</div>

<div class="section-label">喋らせる</div>
<textarea id="say-text" rows="3" placeholder="ここに入れると、ベッキーの声で届く"></textarea>
<button class="say-submit" onclick="sayText()">届ける</button>

<script>
async function fetchStatus() {
  try {
    const d = await (await fetch('/api/status')).json();
    document.getElementById('last-conv').textContent = d.last_conversation;
    const top = d.git_top_project, c = d.git_commits;
    document.getElementById('git-info').textContent = c > 0 ? `${top} ${c}件` : '—';
    const pct = Math.min(100, d.muzu_score / 30 * 100);
    document.getElementById('muzu-val').textContent = d.muzu_score + ' / 30';
    const fill = document.getElementById('muzu-fill');
    fill.style.width = pct + '%';
    fill.className = 'muzu-fill' + (pct >= 90 ? ' hot' : '');
    setPill('tts',     d.tts_enabled);
    setPill('confirm', d.confirm_enabled);
    setPill('muzu',    d.muzu_enabled);
  } catch(e) {}
}

function setPill(id, on) {
  document.getElementById(id + '-pill').className = 'pill' + (on ? ' on' : '');
  document.getElementById(id + '-row').className  = 'toggle-row' + (on ? ' active' : '');
}

async function toggle(id) {
  await fetch('/api/' + id + '/toggle', {method:'POST'});
  fetchStatus();
}

const sliderTimers = {};
function applySlider(type, v) {
  clearTimeout(sliderTimers[type]);
  sliderTimers[type] = setTimeout(async () => {
    const body = type === 'brightness' ? {level: parseInt(v)} : {volume: parseInt(v)};
    await fetch('/api/' + type, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  }, 300);
}

async function moveHead(yaw, pitch) {
  await fetch('/api/head', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({yaw, pitch, speed:50})});
}

async function setLed(r, g, b) {
  await fetch('/api/led', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({r, g, b})});
}

async function sayText() {
  const t = document.getElementById('say-text').value.trim();
  if (!t) return;
  await fetch('/api/say', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:t})});
  document.getElementById('say-text').value = '';
}

fetchStatus();
setInterval(fetchStatus, 10000);
</script>
</body>
</html>"""


async def index(request: Request) -> HTMLResponse:
    return HTMLResponse(HTML)


app = Starlette(routes=[
    Route("/", index),
    Route("/api/status", get_status),
    Route("/api/tts/toggle",     toggle_tts,     methods=["POST"]),
    Route("/api/confirm/toggle", toggle_confirm, methods=["POST"]),
    Route("/api/muzu/toggle",    toggle_muzu,    methods=["POST"]),
    Route("/api/brightness", set_brightness, methods=["POST"]),
    Route("/api/head",       set_head,       methods=["POST"]),
    Route("/api/led",        set_led,        methods=["POST"]),
    Route("/api/volume",     set_volume,     methods=["POST"]),
    Route("/api/say",        say_text,       methods=["POST"]),
])

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
