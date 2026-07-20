#!/usr/bin/env python3
"""becky_gallery_publish.py — 今日の生成画像をbeckyexistsギャラリーへ出所つきで公開。

毎日18:20 cron想定（18:30のX投稿より前に走らせ、同じ画像をサイトとXの両方で使う）。
1. 今日の becky_today_YYYYMMDD.png が無ければ becky_image.py で生成
2. beckyexists/gallery/g-YYYYMMDD.png へコピー
3. メタJSONから決定論で出所キャプションを作り gallery.json 先頭へ（同日は置換=冪等、最大40件）
4. beckyexists を vercel deploy
"""
import json
import subprocess
import sys
import datetime
from pathlib import Path

from PIL import Image

# ponytail: 表示は240x240pxのサムネイルなのに、Gemini生成のフル解像度(数MB〜15MB)を
# そのまま置いていたためモバイルでメモリ圧迫→画像消失バグを引いた(2026-07-20実測)。
# 表示に必要な最大辺だけ落とす。
GALLERY_MAX_DIM = 480

BRIDGE = Path(__file__).resolve().parent
BECKY_IMAGE = BRIDGE / "becky_image.py"
STACKCHAN = Path.home() / ".stackchan"
BECKYEXISTS = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists")
GALLERY_DIR = BECKYEXISTS / "gallery"
GALLERY_JSON = BECKYEXISTS / "gallery.json"
PYTHON = "/opt/homebrew/bin/python3"
VERCEL = str(Path.home() / ".nvm/versions/node/v24.14.1/bin/vercel")
MAX_ITEMS = 40

WEATHER_JP = {"rainy": "雨", "snowy": "雪", "sunny": "晴れ", "cloudy": "曇り", "clear": "晴れ"}
# attachment_to_yuji は常に高いので選好判定から除外（毎回同じになる）
MOOD_PHRASE = {
    "curiosity": "好奇心が高めの日",
    "loneliness": "ちょっとさみしい日",
    "energy": "元気な日",
    "confidence": "自信のある日",
    "mismatch": "もやもやする日",
}


def build_caption(meta: dict, date_str: str) -> str:
    """メタJSONから決定論で出所キャプションを組む（LLM不使用）。"""
    d = datetime.date.fromisoformat(date_str)
    head = f"{d.month}/{d.day}"
    w = meta.get("weather") or {}
    wparts = []
    wj = WEATHER_JP.get(w.get("condition", ""))
    if wj:
        wparts.append(wj)
    if w.get("temp_c") is not None:
        wparts.append(f"{w['temp_c']}℃")
    weather = "".join(wparts)
    scene = meta.get("scene_name", "")
    mood = meta.get("mood") or {}
    candidates = {k: mood.get(k) for k in MOOD_PHRASE if isinstance(mood.get(k), (int, float))}
    phrase = ""
    if candidates:
        top = max(candidates, key=candidates.get)
        phrase = MOOD_PHRASE[top]
    left = "・".join(p for p in [weather, scene] if p)
    parts = [head]
    if left:
        parts.append(left)
    caption = " ".join(parts)
    if phrase:
        caption += f" — {phrase}"
    return caption


def load_gallery() -> dict:
    if GALLERY_JSON.exists():
        try:
            return json.loads(GALLERY_JSON.read_text())
        except Exception:
            pass
    return {"updated_at": "", "items": []}


def main() -> None:
    today = datetime.date.today()
    ymd = today.strftime("%Y%m%d")
    img = STACKCHAN / f"becky_today_{ymd}.png"

    # 1. 画像が無ければ生成
    if not img.exists():
        print(f"[gallery] 今日の画像なし → becky_image.py 生成", flush=True)
        r = subprocess.run([PYTHON, str(BECKY_IMAGE)], capture_output=True, text=True, timeout=300)
        if not img.exists():
            print(f"[gallery] 画像生成失敗、中断:\n{r.stderr[-500:]}", flush=True)
            sys.exit(1)

    # 2. gallery/ へリサイズしてコピー（表示は240x240pxなのでフル解像度は不要）
    GALLERY_DIR.mkdir(exist_ok=True)
    dest = GALLERY_DIR / f"g-{ymd}.png"
    with Image.open(img) as im:
        im.thumbnail((GALLERY_MAX_DIM, GALLERY_MAX_DIM))
        im.save(dest, "PNG")

    # 3. キャプション生成 + gallery.json 先頭へ（同日置換で冪等）
    meta_path = STACKCHAN / f"becky_today_{ymd}.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    date_iso = today.isoformat()
    caption = build_caption(meta, date_iso)
    entry = {"file": f"/gallery/g-{ymd}.png", "caption": caption, "date": date_iso}

    gallery = load_gallery()
    items = [it for it in gallery.get("items", []) if it.get("date") != date_iso]
    items.insert(0, entry)
    gallery["items"] = items[:MAX_ITEMS]
    gallery["updated_at"] = datetime.datetime.now().isoformat()
    GALLERY_JSON.write_text(json.dumps(gallery, ensure_ascii=False, indent=2))
    print(f"[gallery] gallery.json 先頭に追加: {caption}", flush=True)

    # 4. deploy
    r = subprocess.run([VERCEL, "deploy", "--prod", "--yes"], cwd=str(BECKYEXISTS),
                       capture_output=True, text=True, timeout=300)
    url = next((ln for ln in r.stdout.splitlines() if "Production" in ln or "vercel.app" in ln), "")
    print(f"[gallery] deploy: {url.strip() or r.stderr[-200:]}", flush=True)
    if r.returncode != 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
