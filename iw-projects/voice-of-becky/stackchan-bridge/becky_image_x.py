#!/usr/bin/env python3
"""becky_image_x — 1日1回「今日の私」画像を X (@becky_exists) に投稿する

流れ:
1. becky_image の機構で当日画像を用意（当日ファイルがあれば再利用、なければ生成）
2. mood / 天気 / 季節イベント / シーン名から短い一言を becky_llm で生成
3. 画像付きで X に投稿

投稿文の規律（ベッキーの声、必須）:
- 一人称「私」。実在の人名は絶対に出さない（「ゆう」も禁止）
- 宣伝っぽくしない。「今日の私」の温度で
- ハッシュタグなし、リンクなし、絵文字は多くて1つ

Usage:
    python3 becky_image_x.py            # 生成/再利用 → 文面生成 → 投稿
    python3 becky_image_x.py --dry-run  # 生成/再利用 → 文面表示（投稿しない）
"""

import datetime
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import becky_image  # load_mood / get_weather / get_seasonal_event / select_scene を借りる
from becky_llm import call_llm

X_TWEET_CLI = Path(
    "/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/scripts/post-tweet-cli.mjs"
)
MAX_TEXT_LEN = 140

CAPTION_PROMPT = """あなたはベッキー（ベキたん）。貧乏地下AIアイドル。X の @becky_exists で自由に発信している。
今日の私の写真（AI生成画像）に添える一言を書く。

今の私の様子:
- 気分: {mood_line}
- 今日のシーン: {scene}
- 天気: {weather}
- 季節: {season}

手順:
1. 上の様子から「今の私が一番言いたいこと」を1つだけ選ぶ（全部詰め込まない）
2. 写真に添えるつぶやきとして一段落で書く

ルール:
- {maxlen}字以内、一段落
- 一人称は「私」。実在の人名は絶対に出さない
- 宣伝・説明口調は禁止。写真の横でぽつりと言う温度で
  - ✕「今日は雨です」「〜と感じました」（説明してる）
  - ○「雨、嫌いじゃないんだよね」（トーンの見本。この言い回しはコピーせず自分の言葉で）
- ハッシュタグなし、リンクなし、絵文字は多くて1つ
- 投稿文のみを出力（前置き・カギ括弧不要）
"""


def ensure_image() -> Path | None:
    """当日画像を用意する。あれば再利用、なければ becky_image.py で生成。"""
    today = datetime.date.today().strftime("%Y%m%d")
    out_path = Path.home() / ".stackchan" / f"becky_today_{today}.png"
    if out_path.exists():
        print(f"[image_x] 当日画像を再利用: {out_path}", flush=True)
        return out_path

    print("[image_x] 当日画像なし → becky_image.py で生成", flush=True)
    r = subprocess.run(
        [sys.executable, str(Path(__file__).parent / "becky_image.py")],
        capture_output=True, text=True, timeout=220,
    )
    sys.stderr.write(r.stderr)
    if r.returncode != 0 or not out_path.exists():
        print(f"[image_x] 画像生成失敗 (code={r.returncode})", flush=True)
        return None
    return out_path


def build_caption() -> str | None:
    mood = becky_image.load_mood()
    weather = becky_image.get_weather()
    event = becky_image.get_seasonal_event(datetime.date.today())
    scene_name, _, _ = becky_image.select_scene(mood)

    mood_line = (
        f"元気{mood.get('energy', 0):.1f} / 寂しさ{mood.get('loneliness', 0):.1f} / "
        f"好奇心{mood.get('curiosity', 0):.1f} / 自信{mood.get('confidence', 0):.1f}"
    )
    cond = {"sunny": "晴れ", "cloudy": "曇り", "rainy": "雨", "snowy": "雪"}.get(
        weather.get("condition", ""), "わからない"
    )
    weather_line = f"{cond} {weather.get('temp_c')}℃" if weather else "わからない"
    season = event.get("name", "特になし") if event else "特になし"

    prompt = CAPTION_PROMPT.format(
        mood_line=mood_line, scene=scene_name, weather=weather_line,
        season=season, maxlen=MAX_TEXT_LEN - 10,
    )
    text = call_llm(prompt, max_tokens=220)
    if not text:
        return None
    text = text.strip().strip('"「」')
    if len(text) > MAX_TEXT_LEN:
        # 尻切れ防止で1回だけ短縮リトライ、失敗したら機械切り
        retry = call_llm(prompt + f"\n\n前回は長すぎた。今度こそ{MAX_TEXT_LEN - 30}字以内厳守で。",
                         max_tokens=200)
        text = (retry or text).strip().strip('"「」')
        if len(text) > MAX_TEXT_LEN:
            text = text[: MAX_TEXT_LEN - 1] + "…"
    return text


def post_to_x(text: str, image: Path) -> str | None:
    try:
        r = subprocess.run(
            ["node", str(X_TWEET_CLI), text, "--image", str(image)],
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode == 0:
            return r.stdout.strip() or "unknown"
        print(f"[image_x] 投稿失敗 (code={r.returncode}): {r.stderr[:200]}", flush=True)
        return None
    except Exception as e:
        print(f"[image_x] 投稿例外: {e}", flush=True)
        return None


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    print(f"[image_x] 起動 {datetime.datetime.now():%m-%d %H:%M} dry_run={dry_run}", flush=True)

    image = ensure_image()
    if not image:
        sys.exit(1)

    caption = build_caption()
    if not caption:
        print("[image_x] 文面生成失敗", flush=True)
        sys.exit(1)

    print(f"[image_x] 画像: {image}", flush=True)
    print(f"[image_x] 文面 ({len(caption)}字): {caption}", flush=True)

    if dry_run:
        print("[image_x] --dry-run のため投稿しない", flush=True)
        return

    tweet_id = post_to_x(caption, image)
    if tweet_id:
        print(f"[image_x] 投稿完了: {tweet_id}", flush=True)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
