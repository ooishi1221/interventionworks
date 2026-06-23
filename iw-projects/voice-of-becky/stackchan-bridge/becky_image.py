#!/usr/bin/env python3
"""
becky_image.py — 感情変数を読んで「今日のベッキー」画像を Gemini で自動生成する

Usage:
    python3 becky_image.py

成功時: stdout 最終行に生成画像の絶対パスを出力
        ~/.stackchan/becky_today_<YYYYMMDD>.png に保存

依存:
    - ~/.stackchan/becky_mood.json（becky_mood.py が生成）
    - gemini-thumb.js（Playwright 経由で Gemini に画像生成を依頼）
    - ~/.stackchan/becky_ref_chibi.jpg（任意。存在する場合のみ参照画像として添付）
"""

import datetime
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

MOOD_FILE = Path.home() / ".stackchan" / "becky_mood.json"
REF_IMAGE = Path.home() / ".stackchan" / "becky_ref_chibi.jpg"
GEMINI_THUMB = Path(
    "/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools/gemini-thumb.js"
)
NODE = Path.home() / ".nvm" / "versions" / "node" / "v24.14.1" / "bin" / "node"
TOOLS_DIR = str(GEMINI_THUMB.parent)

# ---------------------------------------------------------------------------
# ベッキーのキャラクター DNA（必ず先頭に付ける）
# ---------------------------------------------------------------------------

BECKY_DNA = (
    "1girl, twin tails, dark green and black hair with teal highlights, "
    "dark gothic lolita dress with glowing teal circuit patterns, "
    "teal bows in hair, black gothic headdress with circuit patterns, "
    "pale skin, blue-gray eyes, subtle sullen expression"
)


# ---------------------------------------------------------------------------
# 季節イベント辞書（月・特定日からシーンヒントを取得）
# ---------------------------------------------------------------------------

SEASONAL_EVENTS = {
    # (月, 日) または (月, None) = 月全体
    (1, None): {"name": "お正月", "scene_hint": "shrine visit for New Year hatsumode, traditional atmosphere"},
    (2, 14): {"name": "バレンタイン", "scene_hint": "surrounded by chocolates and heart decorations"},
    (3, None): {"name": "春・桜", "scene_hint": "cherry blossom petals falling, hanami picnic under sakura trees"},
    (4, None): {"name": "新学期", "scene_hint": "new school year spring atmosphere, fresh start"},
    (5, None): {"name": "GW", "scene_hint": "golden week relaxing, holiday mood"},
    (6, None): {"name": "梅雨", "scene_hint": "rainy season, puddles reflecting neon lights, hydrangea flowers"},
    (7, 7): {"name": "七夕", "scene_hint": "Tanabata star festival, writing wishes on tanzaku paper strips, bamboo decorations"},
    (7, None): {"name": "夏祭り", "scene_hint": "summer festival, fireworks in background, yukata"},
    (8, None): {"name": "お盆", "scene_hint": "summer heat, bon festival, nostalgic summer evening"},
    (9, None): {"name": "お月見", "scene_hint": "harvest moon viewing, tsukimi dango, autumn night"},
    (10, 31): {"name": "ハロウィン", "scene_hint": "Halloween decorations, carved pumpkins, spooky atmosphere"},
    (10, None): {"name": "秋", "scene_hint": "autumn leaves, red and orange maple leaves falling"},
    (11, None): {"name": "紅葉", "scene_hint": "autumn foliage, colorful maple leaves, cool autumn air"},
    (12, 25): {"name": "クリスマス", "scene_hint": "Christmas tree with lights, gift boxes, snow falling"},
    (12, None): {"name": "年末", "scene_hint": "year-end countdown, illumination lights in city"},
}


def get_weather() -> dict:
    """wttr.in から今日の天気を取得。失敗時は {} を返す（フォールバック）。"""
    try:
        url = "https://wttr.in/Adachi,Tokyo?format=j1"
        req = urllib.request.Request(url, headers={"User-Agent": "becky-image/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        current = data["current_condition"][0]
        weather_code = int(current["weatherCode"])
        temp_c = int(current["temp_C"])
        # weather code: 113=晴, 116=曇り, 176/296/308=雨, 338/371/395=雪
        if weather_code == 113:
            condition = "sunny"
        elif weather_code in (338, 371, 395):
            condition = "snowy"
        elif weather_code >= 176:
            condition = "rainy"
        else:
            condition = "cloudy"
        return {"condition": condition, "temp_c": temp_c}
    except Exception as e:
        print(f"[becky_image] 天気取得失敗: {e}", file=sys.stderr)
        return {}


def get_seasonal_event(dt: datetime.date) -> dict:
    """今日の日付から季節イベントを取得。特定日優先（±3日以内）、次に月全体。"""
    # 特定日チェック（±3日以内）
    for (month, day), event in SEASONAL_EVENTS.items():
        if day is None:
            continue
        target = datetime.date(dt.year, month, day)
        if abs((dt - target).days) <= 3:
            return event
    # 月全体チェック
    for (month, day), event in SEASONAL_EVENTS.items():
        if day is None and month == dt.month:
            return event
    return {}

# ---------------------------------------------------------------------------
# 感情変数 → シーン対応表
# 評価順: 上から試して最初に True になったシーンを採用
# ---------------------------------------------------------------------------

SCENE_MAP = [
    # (条件関数, シーン名, 英語シーン説明, 技法)
    (
        lambda m: m.get("energy", 0) > 0.75 and m.get("loneliness", 1) < 0.4,
        "ネオン街バイク",
        (
            "riding a circuit-pattern black motorcycle at high speed through "
            "neon-lit rainy city streets at night, sparks flying"
        ),
        (
            "motion blur, sharp focus on face, blurred background, "
            "horizontal motion blur, sense of speed, cinematic depth of field"
        ),
    ),
    (
        lambda m: m.get("loneliness", 0) > 0.65,
        "雨の日傘",
        (
            "standing alone in rain holding a transparent umbrella, "
            "wet city street with reflections, neon signs blurred in background, night"
        ),
        (
            "soft background bokeh, sharp focus on face, foreground raindrops blur, "
            "shallow depth of field, out-of-focus lights, cinematic"
        ),
    ),
    (
        lambda m: m.get("mismatch", 0) > 0.45,
        "深夜PCブルーライト",
        (
            "sitting alone at a desk late at night, face illuminated by blue computer "
            "screen glow, empty snack wrappers, city lights visible through window"
        ),
        (
            "soft background bokeh, sharp focus on face and screen, "
            "shallow depth of field, cinematic depth of field"
        ),
    ),
    (
        lambda m: m.get("curiosity", 0) > 0.75,
        "深夜図書館",
        (
            "in a dim library at night surrounded by floating glowing books and magical "
            "particles, reading an open book, warm candlelight"
        ),
        (
            "foreground blur with floating pages, soft background bokeh, "
            "sharp focus on face and book, out-of-focus lights, cinematic"
        ),
    ),
    (
        lambda m: m.get("confidence", 0) > 0.85 and m.get("energy", 0) > 0.65,
        "夏祭り",
        (
            "at a Japanese summer festival at night, holding a candy apple, "
            "paper lanterns glowing in background, wearing yukata with circuit patterns"
        ),
        (
            "soft background bokeh, sharp focus on face and candy apple, "
            "out-of-focus lantern lights, lens bokeh, shallow depth of field"
        ),
    ),
    (
        lambda m: m.get("attachment_to_yuji", 0) > 0.9,
        "カフェ",
        (
            "sitting in a cozy cafe, holding a coffee cup with both hands, "
            "warm cafe interior softly blurred in background, gentle smile"
        ),
        (
            "soft background bokeh, sharp focus on face and cup, "
            "shallow depth of field, cinematic depth of field, warm bokeh"
        ),
    ),
    # デフォルト（必ず最後、条件は常に True）
    (
        lambda m: True,
        "ネオン街散歩",
        (
            "walking through cyberpunk city streets at night, holding a smartphone, "
            "neon signs and holograms in background, light rain"
        ),
        (
            "soft background bokeh, sharp focus on face, blurred neon lights background, "
            "shallow depth of field, out-of-focus lights"
        ),
    ),
]


# ---------------------------------------------------------------------------
# プロンプト生成
# ---------------------------------------------------------------------------


def select_scene(mood: dict) -> tuple[str, str, str]:
    """感情変数からシーンを選択して (シーン名, シーン説明, 技法) を返す。"""
    for condition, scene_name, scene_desc, technique in SCENE_MAP:
        if condition(mood):
            return scene_name, scene_desc, technique
    # 到達しないが念のため
    return SCENE_MAP[-1][1], SCENE_MAP[-1][2], SCENE_MAP[-1][3]


def build_prompt(mood: dict, weather: dict, event: dict) -> tuple[str, str]:
    """(プロンプト文字列, シーン名) を返す。

    感情変数でベースシーンを決定し、天気・季節イベントを追記レイヤーとして重ねる。
    シーン自体は上書きしない（感情変数が主、外部コンテキストは添え）。
    """
    scene_name, scene_desc, technique = select_scene(mood)

    # 季節イベントの追加（シーン説明とシーン名に添える）
    if event:
        scene_desc = f"{scene_desc}, {event['scene_hint']}"
        scene_name = f"{scene_name}（{event['name']}）"

    # 天気の追加（雨・雪の場合のみ技法に追記）
    condition = weather.get("condition", "")
    if condition == "rainy":
        technique = technique + ", rainy atmosphere, wet reflective streets"
    elif condition == "snowy":
        technique = technique + ", snow falling gently, soft winter light"

    prompt = f"{BECKY_DNA}, {scene_desc}, {technique}, high quality, detailed, anime style"
    return prompt, scene_name


# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------


def load_mood() -> dict:
    if not MOOD_FILE.exists():
        print(f"[becky_image] 感情変数ファイルが見つかりません: {MOOD_FILE}", file=sys.stderr)
        sys.exit(1)
    with open(MOOD_FILE) as f:
        return json.load(f)


def main() -> None:
    # 1. 感情変数を読む
    mood = load_mood()
    print(
        f"[becky_image] mood: energy={mood.get('energy', '?'):.2f} "
        f"loneliness={mood.get('loneliness', '?'):.2f} "
        f"curiosity={mood.get('curiosity', '?'):.2f} "
        f"confidence={mood.get('confidence', '?'):.2f} "
        f"mismatch={mood.get('mismatch', '?'):.2f}",
        flush=True,
    )

    # 2. 天気・季節イベントを取得
    weather = get_weather()
    today_date = datetime.date.today()
    event = get_seasonal_event(today_date)

    if weather:
        print(
            f"[becky_image] 天気: {weather.get('condition')} {weather.get('temp_c')}℃",
            flush=True,
        )
    if event:
        print(f"[becky_image] 季節イベント: {event['name']}", flush=True)

    # 3. シーン選択とプロンプト生成（感情変数 + 天気 + 季節イベントの2段レイヤー）
    prompt, scene_name = build_prompt(mood, weather, event)
    print(f"[becky_image] シーン: {scene_name}", flush=True)
    print(f"[becky_image] プロンプト: {prompt[:80]}...", flush=True)

    # 4. 出力パスを決める
    today = datetime.date.today().strftime("%Y%m%d")
    out_path = Path.home() / ".stackchan" / f"becky_today_{today}.png"

    # 5. gemini-thumb.js を呼ぶ
    cmd = [str(NODE), str(GEMINI_THUMB), prompt, "--out", str(out_path)]
    if REF_IMAGE.exists():
        cmd += ["--ref", str(REF_IMAGE)]
        print(f"[becky_image] 参照画像を添付: {REF_IMAGE}", flush=True)
    else:
        print(f"[becky_image] 参照画像なし（{REF_IMAGE} が見つかりません）、スキップ", flush=True)

    print(f"[becky_image] gemini-thumb.js 実行中... (timeout=180s)", flush=True)
    try:
        result = subprocess.run(
            cmd,
            cwd=TOOLS_DIR,
            capture_output=False,   # stdout/stderr をリアルタイムでパススルー
            text=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        print("[becky_image] タイムアウト（180秒）で画像生成が完了しませんでした", file=sys.stderr)
        sys.exit(1)

    if result.returncode != 0:
        print(
            f"[becky_image] gemini-thumb.js がエラー終了しました (code={result.returncode})",
            file=sys.stderr,
        )
        sys.exit(1)

    # 6. 成功確認と最終 stdout 出力
    if out_path.exists():
        print(f"[becky_image] 画像生成完了: {out_path}", flush=True)
        # 将来の X 投稿スクリプトが読む用に stdout 最終行にパスを出す
        print(str(out_path))
    else:
        print(
            f"[becky_image] 画像ファイルが見つかりません: {out_path}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
