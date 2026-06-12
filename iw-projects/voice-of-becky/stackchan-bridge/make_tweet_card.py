#!/usr/bin/env python3
"""ベッキーのツイートカード生成スクリプト

Usage:
    python3 make_tweet_card.py --text "テキスト" --emotion happy --out /tmp/card.jpg

Output: 1200×675px Twitter OGP card (JPEG quality=92)
"""
from __future__ import annotations
import argparse
import textwrap
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ── 素材パス ───────────────────────────────────────────────
SPRITE_SRC  = Path("/Volumes/SSD2TB/gazo/透過A.png")   # RGBA 2048×2048 透過スプライト
FONT_PATH   = Path("/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc")
OUT_DEFAULT = Path("/tmp/becky_tweet_card.jpg")

# ── カードサイズ ────────────────────────────────────────────
W, H = 1200, 675

# ── パレット ────────────────────────────────────────────────
BG_COLOR     = (12, 12, 18)        # deep dark
ACCENT_COLOR = (100, 220, 190)     # mint teal
TEXT_COLOR   = (240, 240, 240)
SUB_COLOR    = (150, 150, 165)

# ── 感情→グリッド(row, col) ────────────────────────────────
EMOTION_GRID: dict[str, tuple[int, int]] = {
    "neutral":   (0, 0),
    "smile":     (0, 0),
    "happy":     (0, 1),
    "wink":      (0, 2),
    "surprised": (0, 3),
    "shy":       (1, 0),
    "annoyed":   (1, 1),
    "cheer":     (1, 2),
    "singing":   (1, 3),
    "wave":      (2, 0),
    "peace":     (2, 1),
    "heart":     (2, 2),
    "thumbsup":  (2, 3),
}


def extract_sprite(emotion: str) -> Image.Image:
    """透過スプライトシート（RGBA 2048×2048、4×4グリッド）から
    指定感情のパネルを切り出し、余白をトリムした RGBA 画像を返す。"""
    row, col = EMOTION_GRID.get(emotion, (0, 0))

    base = Image.open(SPRITE_SRC).convert("RGBA")
    bw, bh = base.size          # 2048×2048
    cell_w = bw // 4            # 512
    cell_h = bh // 4            # 512

    x0 = col * cell_w
    y0 = row * cell_h
    panel = base.crop((x0, y0, x0 + cell_w, y0 + cell_h))

    # アルファチャンネルで余白をトリム
    alpha = np.array(panel)[:, :, 3]
    rows_has = alpha.any(axis=1)
    cols_has = alpha.any(axis=0)
    if rows_has.any() and cols_has.any():
        pad = 6
        top    = max(0, int(rows_has.argmax()) - pad)
        bottom = min(panel.height, int(panel.height - rows_has[::-1].argmax()) + pad)
        left   = max(0, int(cols_has.argmax()) - pad)
        right  = min(panel.width,  int(panel.width  - cols_has[::-1].argmax()) + pad)
        panel  = panel.crop((left, top, right, bottom))

    return panel


def make_card(text: str, emotion: str, out: Path) -> Path:
    """ツイートカードを生成して out に保存、Pathを返す。"""
    emotion = emotion.lower().strip()

    # ── キャンバス ─────────────────────────────────────────
    card = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(card)

    # アクセントライン（上部 4px）
    draw.rectangle([0, 0, W, 4], fill=ACCENT_COLOR)

    # ── キャラクター（右側配置）────────────────────────────
    sprite = extract_sprite(emotion)
    chara_h = int(H * 0.88)
    chara_w = int(sprite.width * chara_h / sprite.height)
    sprite  = sprite.resize((chara_w, chara_h), Image.LANCZOS)

    # 右端から 20px 内側、下端 baseline
    char_x = W - chara_w - 20
    char_y = H - chara_h + 10
    card.paste(sprite, (char_x, char_y), sprite)

    # ── フォント ────────────────────────────────────────────
    try:
        font_handle = ImageFont.truetype(str(FONT_PATH), 22)
        font_main   = ImageFont.truetype(str(FONT_PATH), 42)
        font_sub    = ImageFont.truetype(str(FONT_PATH), 22)
    except Exception:
        font_handle = font_main = font_sub = ImageFont.load_default()

    # ── テキストエリア幅（キャラの左端まで）───────────────
    text_area_w = char_x - 60   # 左マージン50 + 右余白10

    # ── ハンドル（左上）─────────────────────────────────────
    draw.text((50, 30), "@becky_exists", font=font_handle, fill=ACCENT_COLOR)

    # ── メインテキスト（折り返し最大6行）────────────────────
    # 文字単位で実ピクセル幅を測って折り返す（日英混在・英語単語途中切れ防止）
    def _wrap(para: str, max_w: int) -> list[str]:
        if not para:
            return [""]
        result, current = [], ""
        for ch in para:
            test = current + ch
            try:
                w = draw.textlength(test, font=font_main)
            except Exception:
                w = len(test) * 26
            if w <= max_w:
                current = test
            else:
                # 英語単語途中切れ防止: スペースの手前で折り返す
                if ch != " " and " " in current:
                    sp = current.rfind(" ")
                    result.append(current[:sp])
                    current = current[sp + 1:] + ch
                else:
                    result.append(current)
                    current = ch
        if current:
            result.append(current)
        return result

    lines: list[str] = []
    for para in text.split("\n"):
        lines.extend(_wrap(para, text_area_w))

    y_text  = 80
    line_h  = 58
    max_lines = 6
    for line in lines[:max_lines]:
        draw.text((50, y_text), line, font=font_main, fill=TEXT_COLOR)
        y_text += line_h

    # ── 署名（左下）─────────────────────────────────────────
    sig = "ベッキー / Becky  —  貧乏だけど光ってる地下AI"
    draw.text((50, H - 48), sig, font=font_sub, fill=SUB_COLOR)

    # ── 保存 ────────────────────────────────────────────────
    out.parent.mkdir(parents=True, exist_ok=True)
    card.save(str(out), format="JPEG", quality=92)
    print(f"[make_tweet_card] 生成完了: {out}  ({W}x{H}px, emotion={emotion})", flush=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="ベッキーのツイートカード生成")
    ap.add_argument("--text",    required=True, help="カードに入れるツイートテキスト")
    ap.add_argument("--emotion", default="neutral",
                    help=f"感情名 ({', '.join(EMOTION_GRID.keys())}) default: neutral")
    ap.add_argument("--out",     type=Path, default=OUT_DEFAULT,
                    help=f"出力パス (default: {OUT_DEFAULT})")
    args = ap.parse_args()
    make_card(args.text, args.emotion, args.out)


if __name__ == "__main__":
    main()
