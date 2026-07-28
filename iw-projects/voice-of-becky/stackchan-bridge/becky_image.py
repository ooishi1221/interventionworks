#!/usr/bin/env python3
"""
becky_image.py — 感情変数を読んで「今日のベッキー」画像を OpenAI Images API (gpt-image-2) で自動生成する

Usage:
    python3 becky_image.py

成功時: stdout 最終行に生成画像の絶対パスを出力
        ~/.stackchan/becky_today_<YYYYMMDD>.png に保存

依存:
    - ~/.stackchan/becky_mood.json（becky_mood.py が生成）
    - config.yaml の openai_api_key（becky_llm.py の call_gpt と共通）

2026-07-29: Lovart(Playwright操作、lovart-thumb.js)の無料クレジットが切れ生成が連続失敗した
ため、正本(docs/becky-context/reference_image_stock_pipeline.md)に用意されていた非常口
「OpenAI API直叩き」へ切替。lovart-thumb.js 自体は削除しない(完全撤去ではなく非常口切替)。
"""

import base64
import datetime
import json
import os
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path

from stop_hook_tts import load_config  # config.yaml の openai_api_key 読み込み（becky_llm.py と共通基盤）

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

MOOD_FILE = Path.home() / ".stackchan" / "becky_mood.json"
# 直近7日間に使ったシーン名の軽量ログ（偏り防止用）。fail-soft: 壊れてても生成は止めない。
HISTORY_FILE = Path.home() / ".stackchan" / "becky_image_history.json"
HISTORY_WINDOW_DAYS = 7
# 2026-07-20: Gemini(gemini-thumb.js)からLovart(GPT Image 2、lovart-thumb.js)に切替。
# むぎさん(@mugi_AI_Art)クラスの質感をゆうと実測比較して採用。--ref(参照画像添付)は
# lovart-thumb.js未対応、プロンプトの識別情報だけで十分な一貫性が出ることを実測確認済み。
# 2026-07-29: 無料クレジット切れでLovart(Playwright操作)がデフォルト経路から外れ、
# OpenAI API直叩きに切替。lovart-thumb.js自体は削除しない(非常口を戻せるよう温存)。
# 以下3定数は現在 main() から呼ばれない(手動フォールバック用の参照として残す)。
LOVART_THUMB = Path(
    "/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools/lovart-thumb.js"
)
NODE = Path.home() / ".nvm" / "versions" / "node" / "v24.14.1" / "bin" / "node"
TOOLS_DIR = str(LOVART_THUMB.parent)

# OpenAI Images API 設定(非常口: docs/becky-context/reference_image_stock_pipeline.md 裏取り済み)
OPENAI_IMAGE_MODEL = "gpt-image-2"
OPENAI_IMAGE_SIZE = "1024x1536"  # gpt-image-2対応サイズのうち既存の縦長画角に一番近いもの
OPENAI_IMAGE_QUALITY = "medium"  # 約6円/枚 ≒ 月190円(1日3枠)

# ---------------------------------------------------------------------------
# ベッキーのキャラクター DNA（必ず先頭に付ける）
# ---------------------------------------------------------------------------

# 見た目の不変部分（髪・目・肌）。コスプレでも保つアイデンティティ。
BECKY_IDENTITY = (
    "1girl, twin tails, dark green and black hair with teal highlights, "
    "teal bows in hair, pale skin, blue-gray eyes"
)
# デフォルト衣装。コスプレ/日常シーンでは各シーンの outfit で上書きする。
BECKY_DEFAULT_OUTFIT = (
    "dark gothic lolita dress with glowing teal circuit patterns, "
    "black gothic headdress with circuit patterns, subtle sullen expression"
)
# 後方互換（他スクリプトが BECKY_DNA を参照する場合に備えて残す）
BECKY_DNA = f"{BECKY_IDENTITY}, {BECKY_DEFAULT_OUTFIT}"

# 季節連動の衣装プール（感情シーンのデフォルト衣装をドレス一辺倒からほどく）。
# 水着・浴衣はシーンとセットが前提のため ACTIVITY_SCENES 側の outfit で持たせる（ここには含めない）。
SUMMER_OUTFITS = [
    "casual short-sleeve t-shirt and denim shorts, light summer look",
    "sleeveless summer sundress with a light floral pattern",
    "camisole top and denim shorts, casual summer style",
    "off-shoulder summer blouse with a teal ribbon accent",
    BECKY_DEFAULT_OUTFIT,  # 定番衣装も選択肢の一つとして残す（一辺倒にはしない）
]
WINTER_OUTFITS = [
    "long wool coat with a knit muffler, winter casual",
    "turtleneck sweater under a teal-lined duffel coat",
    "knit cardigan with a scarf, cozy winter look",
    BECKY_DEFAULT_OUTFIT,
]
SPRING_AUTUMN_OUTFITS = [
    "long-sleeve casual shirt with a light cardigan",
    "denim jacket over a simple top, casual layered look",
    "knit sweater with a pleated skirt",
    BECKY_DEFAULT_OUTFIT,
]


def get_seasonal_outfit(month: int) -> str:
    """月から季節衣装プールを選んでランダムに1着返す。"""
    if month in (6, 7, 8, 9):
        pool = SUMMER_OUTFITS
    elif month in (12, 1, 2):
        pool = WINTER_OUTFITS
    else:
        pool = SPRING_AUTUMN_OUTFITS
    return random.choice(pool)


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
# アクティビティ / コスプレシーン（感情に依らない見た目のバリエーション）
# outfit でデフォルト衣装を上書きする。感情シーンと違い天気・季節イベントは添えない。
# ---------------------------------------------------------------------------

ACTIVITY_SCENES = [
    # ── コスプレ / なりきり系 ──
    {"name": "サッカー",
     "outfit": "wearing a teal and black soccer uniform with circuit-pattern trim, sporty",
     "desc": "on a soccer field at golden hour, kicking a ball, energetic dynamic pose",
     "technique": "dynamic action shot, sense of motion, sharp focus on face, stadium bokeh"},
    {"name": "魔法少女",
     "outfit": "magical girl costume in teal and black with glowing circuit accents and frills",
     "desc": "striking a magical-girl transformation pose inside a glowing magic circle, sparkles around",
     "technique": "vibrant colors, sparkle particles, glowing rim light, dynamic composition"},
    {"name": "探偵",
     "outfit": "detective trench coat over a dark outfit, holding a magnifying glass",
     "desc": "as a noir detective in a foggy lamplit street at night, thoughtful expression",
     "technique": "noir lighting, dramatic shadows, cinematic, moody atmosphere"},
    {"name": "チャイナドレス",
     "outfit": "elegant teal and black qipao china dress with circuit-pattern embroidery",
     "desc": "standing in a lantern-lit chinatown alley at night, elegant graceful pose",
     "technique": "warm red lantern bokeh, soft focus, elegant, cinematic depth"},
    {"name": "制服",
     "outfit": "japanese school uniform blazer with a teal ribbon",
     "desc": "walking to school on a bright morning street, bag over shoulder, casual glance back",
     "technique": "bright morning light, lens flare, soft bokeh, fresh clean tones"},
    {"name": "サイバーレースクイーン",
     "outfit": ("cyber race queen bodysuit, glossy white and black stretch bodysuit with "
                "glowing teal circuit line accents, metallic silver segmented armor panels, "
                "high-cut hips, thigh-high racing boots with silver heel guards"),
     "desc": "standing confidently on a racing circuit pit lane beside sports cars, futuristic motorsport atmosphere",
     "technique": "sharp reflections on glossy fabric, cool metallic highlights, sense of speed, cinematic depth of field"},
    # ── 日常の一幕系 ──
    {"name": "ゲーム実況",
     "outfit": "casual oversized hoodie with teal accents, gaming headset on",
     "desc": "at a gaming setup with multiple monitors and RGB lights, excited mid-commentary expression",
     "technique": "RGB ambient glow, screen light on face, cozy dim room bokeh, lively mood"},
    {"name": "音楽制作",
     "outfit": "casual outfit with studio headphones around the neck",
     "desc": "at a music production desk, a DAW on the screen, keyboard and studio monitors, focused",
     "technique": "warm desk-lamp light, screen glow, studio bokeh, focused quiet mood"},
    {"name": "料理",
     "outfit": "apron over a casual outfit",
     "desc": "cooking in a cozy kitchen, holding a ladle, steam rising from a pot, gentle smile",
     "technique": "warm kitchen light, soft rising steam, homey bokeh, warm tones"},
    {"name": "寝起き",
     "outfit": "oversized pajamas with a teal circuit print, slightly messy hair",
     "desc": "just woke up, sitting on a bed stretching, sleepy half-lidded expression, soft morning light",
     "technique": "soft diffused morning light, cozy, gentle bokeh, warm intimate mood"},
    # ── 夏の一幕系（水着・浴衣はシーンとセットで固定、他季節に出さない） ──
    {"name": "ビーチ",
     "outfit": "teal and black swimsuit with circuit-pattern trim, sun hat",
     "desc": "standing on a sunny beach with turquoise waves, sand between toes, relaxed summer smile",
     "technique": "bright sunlight, sparkling water bokeh, high-key summer tones, cheerful mood"},
    {"name": "プール",
     "outfit": "teal and black swimsuit with circuit-pattern trim",
     "desc": "sitting at a poolside with feet in the water, sunglasses pushed up, cool drink nearby",
     "technique": "bright reflective water bokeh, high-key summer light, relaxed mood"},
    {"name": "かき氷屋",
     "outfit": "casual short-sleeve t-shirt and shorts, summer festival vibe",
     "desc": "eating shaved ice (kakigori) at a summer stand, colorful syrup, happy small bite expression",
     "technique": "bright daylight, vivid colors, soft bokeh, cheerful summer mood"},
    {"name": "花火大会",
     "outfit": "yukata with teal circuit-pattern obi, hair up with a fan tucked in",
     "desc": "watching fireworks burst overhead at a summer festival, awed upward gaze",
     "technique": "vivid fireworks bokeh, warm lantern glow, night sky, cinematic"},
    {"name": "ひまわり畑",
     "outfit": "sleeveless summer sundress with a light floral pattern, straw hat",
     "desc": "standing in a vast sunflower field under blue sky, arms slightly spread, joyful",
     "technique": "bright golden sunlight, vivid yellow and green bokeh, high-key summer tones"},
    {"name": "縁日",
     "outfit": "yukata with teal circuit-pattern obi",
     "desc": "walking through summer festival stalls at dusk, holding a goldfish-scooping net, playful",
     "technique": "warm string lights bokeh, festival stall colors, dusk atmosphere, cinematic"},
    {"name": "川辺の夕涼み",
     "outfit": "camisole top and denim shorts, casual summer style",
     "desc": "sitting on riverside steps at dusk to cool down, feet near the water, calm relaxed expression",
     "technique": "soft dusk light, water reflection bokeh, cool blue-orange tones, tranquil mood"},
    {"name": "アイス食べてる",
     "outfit": "off-shoulder summer blouse with a teal ribbon accent",
     "desc": "walking down a sunny street licking a soft-serve ice cream cone, cheerful casual moment",
     "technique": "bright daylight, soft bokeh, warm cheerful summer tones"},
    {"name": "扇風機の前でだらけてる",
     "outfit": "loose camisole and short shorts, hair let down, very relaxed",
     "desc": "lying on the floor in front of an electric fan on a hot day, lazily melting expression",
     "technique": "soft indoor daylight, hazy summer heat mood, relaxed bokeh"},
    # ── ネオポップ画風系（2026-07-27、むぎ@AIアートのセカイ氏のネオポップ解説プロンプト型を採用） ──
    # Lovart(lovart-thumb.js)は単一プロンプト文字列のみ受け付け、negative prompt引数はない。
    # 記事推奨のnegative prompt(photorealistic, muted colors, cluttered composition,
    # muddy colors, weak outlines, unreadable design)はポジティブ側の言い回しで吸収する
    # (例: clean uncluttered composition, crisp bold outlines)。lovart-thumb.js側は改造しない。
    {"name": "ネオポップ・アイドルポスター",
     "outfit": "casual street-style outfit with teal accents",
     "desc": ("neo pop idol poster, anime idol girl posing with a microphone, vivid pop colors, "
              "bold graphic background, halftone dots, comic-style sparkle symbols, sticker-like layout, "
              "modern pop culture energy, clear silhouette, high-impact promotional poster design"),
     "technique": ("neo pop art style, anime pop art fusion, bold outlines, sticker-like character design, "
                   "teal, mint green, magenta, yellow, black and white palette, limited but vibrant palette, "
                   "high contrast color blocks, clean uncluttered composition, crisp bold outlines, "
                   "vividly saturated colors, readable graphic poster design")},
    {"name": "ネオポップ・ストリート",
     "outfit": "casual street-style outfit with teal accents",
     "desc": ("standing in front of a graffiti wall, modern pop art illustration, street art background "
              "with graffiti elements, spray paint texture, sticker bomb details, bold neon color palette, "
              "thick clean outlines, rebellious but cute mood, urban pop culture style"),
     "technique": ("neo pop art style, anime pop art fusion, bold outlines, halftone dots, "
                   "sticker-like character design, clear silhouette, "
                   "teal, mint green, magenta, yellow, black and white palette, limited but vibrant palette, "
                   "high contrast color blocks, clean uncluttered composition, "
                   "vividly saturated colors, readable graphic design")},
    {"name": "ネオポップ・ゲームUI",
     "outfit": "casual street-style outfit with teal accents, gaming headset on",
     "desc": ("neo pop art style, game UI inspired graphic details, pixel art accents, "
              "comic speech bubble elements, bright graphic color scheme, bold outlines, energetic pose, "
              "playful modern design, clean poster layout"),
     "technique": ("anime pop art fusion, halftone dots, sticker-like character design, clear silhouette, "
                   "teal, mint green, magenta, yellow, black and white palette, limited but vibrant palette, "
                   "high contrast color blocks, clean uncluttered composition, crisp bold outlines, "
                   "vividly saturated colors, readable graphic design")},
    # ── 蒔絵・和風系（2026-07-28、むぎ@AIアートのセカイ氏の蒔絵解説プロンプト型を採用） ──
    {"name": "蒔絵の間",
     "outfit": "elegant black kimono with teal circuit-pattern obi and fine gold thread embroidery",
     "desc": ("kneeling gracefully in a traditional Japanese room with a maki-e lacquer folding screen "
              "behind her, holding a paper fan, serene composed expression, refined and mysterious mood"),
     "technique": ("maki-e style, black lacquer texture, delicate gold powder decoration, "
                   "fine gold linework, sprinkled gold powder, deep black lacquer surface with subtle "
                   "lacquer shine, elegant negative space composition, traditional Japanese craftsmanship")},
]


# ---------------------------------------------------------------------------
# プロンプト生成
# ---------------------------------------------------------------------------


def load_recent_scenes() -> set[str]:
    """直近 HISTORY_WINDOW_DAYS 日間に使ったシーン名の集合を返す。壊れてても空集合で継続（fail-soft）。"""
    try:
        with open(HISTORY_FILE) as f:
            records = json.load(f)
        cutoff = datetime.date.today() - datetime.timedelta(days=HISTORY_WINDOW_DAYS)
        return {
            r["scene"] for r in records
            if datetime.date.fromisoformat(r["date"]) >= cutoff
        }
    except Exception:
        return set()


def record_scene(scene_name: str) -> None:
    """今日選んだシーン名を履歴に追記。直近14日分だけ残して肥大化を防ぐ。fail-soft。"""
    try:
        records = []
        if HISTORY_FILE.exists():
            with open(HISTORY_FILE) as f:
                records = json.load(f)
        records.append({"date": datetime.date.today().isoformat(), "scene": scene_name})
        cutoff = datetime.date.today() - datetime.timedelta(days=14)
        records = [
            r for r in records
            if datetime.date.fromisoformat(r["date"]) >= cutoff
        ]
        with open(HISTORY_FILE, "w") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[becky_image] シーン履歴の保存に失敗（無視して継続）: {e}", file=sys.stderr)


def select_scene(mood: dict) -> tuple[str, str, str, str | None]:
    """シーンを選び (シーン名, シーン説明, 技法, 衣装) を返す。
    衣装 None = デフォルト衣装（感情シーン）、str = コスプレ/日常の上書き衣装。
    直近7日で使ったシーンは避ける（全滅時は制限解除、fail-soft）。"""
    recent = load_recent_scenes()

    # 4割の日はコスプレ/日常シーン（見た目のバリエーション）、残りは感情シーン
    if random.random() < 0.4:
        pool = [s for s in ACTIVITY_SCENES if s["name"] not in recent] or ACTIVITY_SCENES
        s = random.choice(pool)
        return s["name"], s["desc"], s["technique"], s["outfit"]

    matches = [(name, desc, tech) for cond, name, desc, tech in SCENE_MAP if cond(mood)]
    filtered = [m for m in matches if m[0] not in recent] or matches
    scene_name, scene_desc, technique = filtered[0]
    return scene_name, scene_desc, technique, None


def build_prompt(mood: dict, weather: dict, event: dict, dt: datetime.date | None = None) -> tuple[str, str]:
    """(プロンプト文字列, シーン名) を返す。

    感情変数でベースシーンを決定し、天気・季節イベントを追記レイヤーとして重ねる。
    シーン自体は上書きしない（感情変数が主、外部コンテキストは添え）。
    """
    dt = dt or datetime.date.today()
    # 屋内シーン。屋外イベント（花火・花見・浴衣）を室内に足すと矛盾するので添えない。
    INDOOR_SCENES = {"カフェ", "深夜図書館", "深夜PCブルーライト"}

    scene_name, scene_desc, technique, outfit = select_scene(mood)
    base_scene_name = scene_name  # 履歴記録用（季節イベント suffix を付ける前の名前）
    record_scene(base_scene_name)
    is_activity = outfit is not None  # コスプレ/日常はシーン単体で完結（天気・季節を添えない）

    if not is_activity:
        is_indoor = scene_name in INDOOR_SCENES
        # 季節イベントの追加（屋外シーンにだけ添える。屋内は室内感を優先）
        if event and not is_indoor:
            scene_desc = f"{scene_desc}, {event['scene_hint']}"
            scene_name = f"{scene_name}（{event['name']}）"
        # 天気の追加。花火など屋外の火の演出とは雨/雪が両立しない（＝「花火に雨」を防ぐ）。
        # 屋内は路面ではなく窓越しの雨にする。雨でも毎回「雨シーン」にせず、雨上がり・無言及にも分散する。
        hint = (event or {}).get("scene_hint", "")
        fire_event = "fireworks" in hint and not is_indoor
        condition = weather.get("condition", "")
        if condition == "rainy" and not fire_event:
            roll = random.random()
            if is_indoor:
                if roll < 0.5:
                    technique += ", rain streaking down the window, cozy indoor lighting"
                # 残り5割は雨に触れない（室内の雰囲気を優先）
            elif roll < 0.4:
                technique += ", rainy atmosphere, wet reflective streets"
            elif roll < 0.7:
                technique += ", streets still wet after the rain, clearing sky, fresh air"
            # 残り3割は雨に触れない
        elif condition == "snowy" and not fire_event and not is_indoor:
            technique += ", snow falling gently, soft winter light"

    outfit = outfit or get_seasonal_outfit(dt.month)
    prompt = (
        f"{BECKY_IDENTITY}, {outfit}, {scene_desc}, {technique}, "
        "high quality, detailed, anime style, no text, no logos, no watermark"
    )
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
    # 0. 冪等性: 当日分が既にあれば何もしない(X投稿から分離しストック化、2026-07-22)。
    # 1日3枠cronで叩かれる想定なので、Lovartクレジット切れ等で1枠失敗しても次の枠に静かに託せる。
    today_check = datetime.date.today().strftime("%Y%m%d")
    existing = Path.home() / ".stackchan" / f"becky_today_{today_check}.png"
    if existing.exists():
        print(f"[becky_image] 当日分は生成済み → スキップ: {existing}", flush=True)
        print(str(existing))
        return

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

    # 5. OpenAI Images API (gpt-image-2) を直叩き（2026-07-29 Lovart非常口切替、HTTP1本でPlaywright不要）
    cfg = load_config() or {}
    api_key = cfg.get("openai_api_key", "").strip()
    if not api_key:
        print(
            "[becky_image] OPENAI_API_KEY が config.yaml に見つかりません。"
            "ゆうにキー発行/設定を確認してもらう必要あり",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"[becky_image] OpenAI Images API ({OPENAI_IMAGE_MODEL}) 実行中... (timeout=120s)", flush=True)
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps({
            "model": OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "size": OPENAI_IMAGE_SIZE,
            "quality": OPENAI_IMAGE_QUALITY,
            "n": 1,
        }).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"[becky_image] OpenAI API がエラー終了しました (code={e.code}): {body[:300]}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"[becky_image] OpenAI API 接続失敗: {e}", file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        print("[becky_image] タイムアウト（120秒）で画像生成が完了しませんでした", file=sys.stderr)
        sys.exit(1)

    try:
        b64_image = data["data"][0]["b64_json"]
    except (KeyError, IndexError) as e:
        print(f"[becky_image] OpenAI API 応答の形式が想定外です: {e}", file=sys.stderr)
        sys.exit(1)

    out_path.write_bytes(base64.b64decode(b64_image))

    # 6. 成功確認と最終 stdout 出力
    if out_path.exists():
        print(f"[becky_image] 画像生成完了: {out_path}", flush=True)

        # 7. メタ情報保存（ギャラリーのキャプション生成用。既存挙動には影響しない追記のみ）
        meta_path = Path.home() / ".stackchan" / f"becky_today_{today}.json"
        meta = {
            "scene_name": scene_name,
            "weather": weather,
            "event": event.get("name") if event else None,
            "mood": mood,
            "generated_at": datetime.datetime.now().astimezone().isoformat(),
        }
        with open(meta_path, "w") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(f"[becky_image] メタ情報保存: {meta_path}", flush=True)

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
