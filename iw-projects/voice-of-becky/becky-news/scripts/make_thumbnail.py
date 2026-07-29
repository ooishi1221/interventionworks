#!/usr/bin/env python3
"""サムネテンプレ(assets/thumb-templates/)への座標指定テロップ入れ。

ヒラギノ角ゴ W9 + 二重縁取り(外フチ色→白フチ→本体色)。2026-07-29 試作で型確立。

使い方:
  python3 make_thumbnail.py <template.png> <out.png> \
      --telop "AIアイドルの:70,130:72:#2BB3E8:#1B6FA8" \
      --telop "マイクラ:60,260:120:#FF2D78:#B0104E" \
      --telop "実況!!:60,420:150:#FFD400:#E86A00"

--telop = "文字:x,y:サイズ:本体色:外フチ色"。本体色 white は白フチを抜く(潰れ防止)。
"""
import argparse

from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W9.ttc"


def telop(draw, xy, text, size, fill, outer):
    font = ImageFont.truetype(FONT, size)
    draw.text(xy, text, font=font, fill=outer, stroke_width=int(size * 0.22), stroke_fill=outer)
    if fill.lower() in ("white", "#ffffff"):
        draw.text(xy, text, font=font, fill=fill)
    else:
        draw.text(xy, text, font=font, fill=fill, stroke_width=int(size * 0.12), stroke_fill="white")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("template")
    ap.add_argument("out")
    ap.add_argument("--telop", action="append", required=True,
                    help='"文字:x,y:サイズ:本体色:外フチ色"')
    args = ap.parse_args()

    im = Image.open(args.template).convert("RGBA")
    d = ImageDraw.Draw(im)
    for spec in args.telop:
        text, xy, size, fill, outer = spec.split(":")
        x, y = map(int, xy.split(","))
        telop(d, (x, y), text, int(size), fill, outer)
    im.convert("RGB").save(args.out, quality=92)
    print(f"saved: {args.out}")


if __name__ == "__main__":
    main()
