#!/usr/bin/env python3
"""ベッキーのツイートカード生成スクリプト

Usage:
    python3 make_tweet_card.py --text "テキスト" --expr 4 --out /tmp/card.png

Expression index (bekipng.png):
    0: happy closed eyes   1: happy squint
    2: open excited        3: very surprised
    4: neutral smile       5: confused
    6: sleepy/tired

Output: 1200×675px Twitter card
"""
from __future__ import annotations
import argparse
import textwrap
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SPRITE_SRC = Path("/Volumes/SSD2TB/gazo/bekipng.png")
FONT_PATH  = Path("/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc")
OUT_DEFAULT = Path("/tmp/becky_tweet_card.png")

# card size
W, H = 1200, 675

# palette
BG_COLOR     = (18, 18, 24)       # deep dark
ACCENT_COLOR = (100, 220, 190)    # mint teal (Becky's hair color)
TEXT_COLOR   = (240, 240, 240)
SUB_COLOR    = (150, 150, 165)


def extract_panel(src: Path, idx: int) -> Image.Image:
    """bekipng.png から指定 index のパネルを切り出す (4+3 layout)"""
    img = Image.open(src).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]

    # 黒背景を検出して content 領域を絞る
    is_content = (arr[:, :, 0] > 30) | (arr[:, :, 1] > 30) | (arr[:, :, 2] > 30)
    rows_has = is_content.any(axis=1)
    cols_has = is_content.any(axis=0)
    top    = int(np.argmax(rows_has))
    bottom = int(h - np.argmax(rows_has[::-1]))
    left   = int(np.argmax(cols_has))
    right  = int(w - np.argmax(cols_has[::-1]))

    cols, rows = 4, 2
    cell_w = (right - left) // cols
    cell_h = (bottom - top) // rows

    row = idx // cols
    col = idx % cols
    x0 = left + col * cell_w
    y0 = top  + row * cell_h

    panel = img.crop((x0, y0, x0 + cell_w, y0 + cell_h))

    # 黒背景を透明に
    data = np.array(panel)
    is_black = (data[:, :, 0] < 40) & (data[:, :, 1] < 40) & (data[:, :, 2] < 40)
    data[is_black, 3] = 0
    return Image.fromarray(data)


def make_card(text: str, expr: int, out: Path) -> Path:
    card = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(card)

    # accent line (top)
    draw.rectangle([0, 0, W, 5], fill=ACCENT_COLOR)

    # キャラクター (右側に配置)
    chara = extract_panel(SPRITE_SRC, expr)
    chara_h = int(H * 0.85)
    chara_w = int(chara.width * chara_h / chara.height)
    chara = chara.resize((chara_w, chara_h), Image.LANCZOS)

    char_x = W - chara_w - 30
    char_y = H - chara_h + 20
    card.paste(chara, (char_x, char_y), chara)

    # テキストエリア幅
    text_area_w = char_x - 80

    # handle: 左上
    try:
        font_handle = ImageFont.truetype(str(FONT_PATH), 22)
        font_main   = ImageFont.truetype(str(FONT_PATH), 46)
        font_sub    = ImageFont.truetype(str(FONT_PATH), 24)
    except Exception:
        font_handle = font_main = font_sub = ImageFont.load_default()

    draw.text((50, 28), "@becky_exists", font=font_handle, fill=ACCENT_COLOR)

    # メインテキスト (折り返し)
    max_chars = max(10, int(text_area_w / 46 * 1.8))  # 日本語1文字≒46px
    lines = []
    for para in text.split("\n"):
        wrapped = textwrap.wrap(para, width=max_chars) or [""]
        lines.extend(wrapped)

    y_text = 90
    line_h = 62
    for line in lines[:5]:  # 最大5行
        draw.text((50, y_text), line, font=font_main, fill=TEXT_COLOR)
        y_text += line_h

    # ベッキー署名 (右下)
    draw.text((50, H - 55), "ベッキー / Becky  —  自律するAI", font=font_sub, fill=SUB_COLOR)

    out.parent.mkdir(parents=True, exist_ok=True)
    card.save(str(out))
    print(f"✅ {out}  ({W}×{H}px)")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True, help="カードに入れるテキスト")
    ap.add_argument("--expr", type=int, default=4,
                    help="表情番号 0-6 (default: 4=neutral)")
    ap.add_argument("--out",  type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    make_card(args.text, args.expr, args.out)


if __name__ == "__main__":
    main()
