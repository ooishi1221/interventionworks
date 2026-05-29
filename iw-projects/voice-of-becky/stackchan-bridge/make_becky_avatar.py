#!/usr/bin/env python3
"""Becky avatar sprite sheet → becky_avatar_set.bin (537,600 bytes, layered)

Usage:
    python3 make_becky_avatar.py [--src PATH]

Default src: ~/Desktop/素材/名称未設定のデザイン (1).png
Output:      ~/.stackchan/avatar/becky_avatar_set.bin
             ~/.stackchan/avatar/*.png  (debug preview)

Expects a 7-panel sprite sheet (4 top + 3 bottom) with transparent/black bg.
Panels are auto-detected by alpha channel (or dark bg removal).

Panel → slot mapping (layered mode):
  face:  idle / happy / thinking / sad / surprised / embarrassed
  eyes:  open / half / closed
  mouth: closed / half / open / e / u
"""
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image, ImageOps

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULT_SRC = Path.home() / "Desktop" / "素材" / "名称未設定のデザイン (1).png"
DEST        = Path.home() / ".stackchan" / "avatar"
W, H        = 160, 120
BG          = (240, 170, 195)   # deeper pink

# Panel → slot mapping.
# panels[0..6] correspond to the 7 expressions in reading order (top-left → bottom-right).
# Reuse the same panel for multiple slots when no exact match exists.
#
# Layout assumed:
#   0=idle  1=happy(目閉じ)  2=喋り笑顔  3=びっくり小
#   4=喋り開口  5=大驚き  6=考え込み
SLOTS = [
    # --- face (6) ---
    ("idle",          0),
    ("happy",         1),
    ("thinking",      6),
    ("sad",           6),
    ("surprised",     5),
    ("embarrassed",   1),
    # --- eyes (3) ---
    ("eyes_open",     0),
    ("eyes_half",     6),   # panel[6] = 考え込み (目が落ち着いてる、blush なし)
    ("eyes_closed",   1),   # panel[1] = 目を閉じた笑顔
    # --- mouth (5) ---
    ("mouth_closed",  0),
    ("mouth_half",    2),
    ("mouth_open",    4),
    ("mouth_e",       4),
    ("mouth_u",       3),
]

EXPECTED_FRAME  = W * H * 2        # 38_400
EXPECTED_TOTAL  = 14 * EXPECTED_FRAME  # 537_600


# ── Panel detection ────────────────────────────────────────────────────────────

def detect_panels(sheet: Image.Image) -> list[Image.Image]:
    """Auto-detect 7 panels from the sprite sheet using alpha channel.

    Works for both transparent-bg and solid-black-bg source images.
    Returns list of 7 RGB PIL images composited onto BG color.
    """
    rgba = sheet.convert("RGBA")
    sw, sh = rgba.size
    px = rgba.load()

    def row_has_content(y: int) -> bool:
        return any(px[x, y][3] > 10 for x in range(0, sw, 8))

    def col_has_content(x: int, y0: int, y1: int) -> bool:
        return any(px[x, y][3] > 10 for y in range(y0, y1, 4))

    # --- find row ranges ---
    in_block, row_ranges = False, []
    for y in range(sh):
        h = row_has_content(y)
        if h and not in_block:
            start = y; in_block = True
        elif not h and in_block:
            row_ranges.append((start, y)); in_block = False
    if in_block:
        row_ranges.append((start, sh))

    # --- find column ranges per row ---
    panels: list[Image.Image] = []
    for y0, y1 in row_ranges:
        in_block = False
        for x in range(sw):
            h = col_has_content(x, y0, y1)
            if h and not in_block:
                cx0 = x; in_block = True
            elif not h and in_block:
                crop = rgba.crop((cx0, y0, x, y1))
                bg_img = Image.new("RGBA", crop.size, (*BG, 255))
                bg_img.paste(crop, mask=crop.split()[3])
                panels.append(bg_img.convert("RGB"))
                in_block = False
        if in_block:
            crop = rgba.crop((cx0, y0, sw, y1))
            bg_img = Image.new("RGBA", crop.size, (*BG, 255))
            bg_img.paste(crop, mask=crop.split()[3])
            panels.append(bg_img.convert("RGB"))

    return panels


# ── Conversion ─────────────────────────────────────────────────────────────────

def fit_to_frame(img: Image.Image) -> Image.Image:
    """Letterbox: fit into W×H maintaining aspect ratio."""
    sw, sh = img.size
    scale  = min(W / sw, H / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    resized = img.resize((nw, nh), Image.LANCZOS)
    frame   = Image.new("RGB", (W, H), BG)
    frame.paste(resized, ((W - nw) // 2, (H - nh) // 2))
    return frame


def to_rgb565_le(img: Image.Image) -> bytes:
    img = fit_to_frame(img)
    px  = img.tobytes()
    out = bytearray(len(px) // 3 * 2)
    j = 0
    for i in range(0, len(px), 3):
        r, g, b = px[i], px[i + 1], px[i + 2]
        v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
        out[j] = v & 0xFF; out[j + 1] = (v >> 8) & 0xFF; j += 2
    return bytes(out)


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC,
                    help="Sprite sheet PNG path")
    args = ap.parse_args()

    src: Path = args.src
    if not src.exists():
        raise FileNotFoundError(f"素材が見つかりません: {src}")

    DEST.mkdir(parents=True, exist_ok=True)

    print(f"Loading: {src}")
    sheet  = Image.open(src)
    panels = detect_panels(sheet)
    print(f"Detected {len(panels)} panels (expected 7)")
    if len(panels) != 7:
        print("⚠️  パネル数が 7 ではありません。SLOTS マッピングを確認してください。")

    payload = bytearray()
    for name, panel_idx in SLOTS:
        if panel_idx >= len(panels):
            raise IndexError(f"{name}: panel[{panel_idx}] は範囲外 (detected {len(panels)} panels)")
        img = panels[panel_idx]
        framed = fit_to_frame(img)
        png_path = DEST / f"{name}.png"
        framed.save(png_path)
        raw = to_rgb565_le(img)
        assert len(raw) == EXPECTED_FRAME, f"{name}: {len(raw)} != {EXPECTED_FRAME}"
        payload.extend(raw)
        print(f"  {name:16s} ← panel[{panel_idx}]  {len(raw):,}B")

    assert len(payload) == EXPECTED_TOTAL, f"total {len(payload)} != {EXPECTED_TOTAL}"
    bin_path = DEST / "becky_avatar_set.bin"
    bin_path.write_bytes(payload)
    print(f"\nBinary: {bin_path}  ({len(payload):,} bytes)  ✅")
    print("Next → load_avatar_set(archive_path=str(bin_path), mode='layered')")


if __name__ == "__main__":
    main()
