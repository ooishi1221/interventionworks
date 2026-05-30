#!/usr/bin/env python3
"""Becky avatar sprite sheets → becky_avatar_set.bin (537,600 bytes, layered)

Usage:
    python3 make_becky_avatar.py [--face PATH] [--mouth PATH]

Defaults:
    --face  /Volumes/SSD2TB/gazo/め.png         (3×2 grid, 6 panels: face/eyes source)
    --mouth /Volumes/SSD2TB/gazo/名称未設定のデザイン (1).png  (3×2 grid, 5 panels: mouth source)

Output:
    ~/.stackchan/avatar/becky_avatar_set.bin
    ~/.stackchan/avatar/*.png  (debug preview)

Panel layout:
  め.png (face/eyes):
    0=neutral(open)  1=happy(smiling)  2=blink(closed)
    3=surprised      4=droopy/tired    5=embarrassed(closed)

  口.png (mouth):
    0=closed  1=half  2=wide-open  3=E-shape  4=open

Slot → (source, panel_index):
  face:  neutral/happy/blush/sad/angry/surprise  ← め.png
  eyes:  default/happy/sad_angry                 ← め.png
  mouth: close/happy_close/open/happy_open/sad_close ← 口.png
"""
from __future__ import annotations
import argparse
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULT_FACE  = Path("/Volumes/SSD2TB/gazo/め.png")
DEFAULT_MOUTH = Path("/Volumes/SSD2TB/gazo/名称未設定のデザイン (1).png")
DEST          = Path.home() / ".stackchan" / "avatar"
W, H          = 160, 120
BG            = (240, 170, 195)   # deeper pink

# Slot → (source_key, panel_index)
# source_key: "face" = め.png panels, "mouth" = 口.png panels
SLOTS = [
    # --- face (6) ---
    ("face_neutral",      ("face",  0)),  # open eyes, smile
    ("face_happy",        ("face",  1)),  # smiling eyes
    ("face_blush",        ("face",  2)),  # blink / eyes closed
    ("face_sad",          ("face",  4)),  # droopy / tired
    ("face_angry",        ("face",  5)),  # embarrassed / closed
    ("face_surprise",     ("face",  3)),  # wide open surprised
    # --- eyes (3) ---
    ("eyes_default",      ("face",  0)),  # open
    ("eyes_happy",        ("face",  1)),  # smiling
    ("eyes_sad_angry",    ("face",  2)),  # closed (blink)
    # --- mouth (5) ---
    ("mouth_close",       ("mouth", 0)),
    ("mouth_open",        ("mouth", 2)),
    ("mouth_happy_close", ("mouth", 1)),
    ("mouth_happy_open",  ("mouth", 2)),
    ("mouth_sad_close",   ("mouth", 0)),
]

EXPECTED_FRAME = W * H * 2        # 38_400
EXPECTED_TOTAL = 14 * EXPECTED_FRAME  # 537_600


# ── Panel extraction ──────────────────────────────────────────────────────────

def extract_panels_grid(src: Path, cols: int = 3, rows: int = 2,
                        n_panels: int | None = None) -> list[Image.Image]:
    """Extract panels from a uniform grid (white or black background)."""
    img = Image.open(src).convert("RGB")
    arr = np.array(img, dtype=np.int32)
    w, h = img.size

    # detect background color from corners
    corner_avg = np.mean([arr[0, 0], arr[0, -1], arr[-1, 0], arr[-1, -1]], axis=0)
    is_white_bg = corner_avg.mean() > 180

    if is_white_bg:
        # non-white pixels (hair, eyes, skin lines) — any channel < 220
        is_content = (arr[:, :, 0] < 220) | (arr[:, :, 1] < 220) | (arr[:, :, 2] < 220)
    else:
        # non-black pixels
        is_content = (arr[:, :, 0] > 30) | (arr[:, :, 1] > 30) | (arr[:, :, 2] > 30)

    rows_has = is_content.any(axis=1)
    cols_has = is_content.any(axis=0)
    top    = int(np.argmax(rows_has))
    bottom = int(h - np.argmax(rows_has[::-1]))
    left   = int(np.argmax(cols_has))
    right  = int(w - np.argmax(cols_has[::-1]))

    TRIM   = 8
    cell_w = (right - left) // cols
    cell_h = (bottom - top) // rows
    n      = n_panels or (cols * rows)

    panels: list[Image.Image] = []
    for r in range(rows):
        for c in range(cols):
            if len(panels) >= n:
                break
            x0 = left  + c * cell_w + TRIM
            y0 = top   + r * cell_h + TRIM
            crop = arr[y0: y0 + cell_h - TRIM * 2, x0: x0 + cell_w - TRIM * 2]

            result = crop.copy()
            if is_white_bg:
                # flood fill from edges: replace only background-connected white pixels
                h2, w2 = crop.shape[:2]
                visited = np.zeros((h2, w2), dtype=bool)
                q: deque[tuple[int, int]] = deque()
                for x in range(w2):
                    q.append((0, x)); q.append((h2 - 1, x))
                for y in range(h2):
                    q.append((y, 0)); q.append((y, w2 - 1))
                while q:
                    y, x = q.popleft()
                    if visited[y, x]: continue
                    visited[y, x] = True
                    pr, pg, pb = int(crop[y, x, 0]), int(crop[y, x, 1]), int(crop[y, x, 2])
                    if pr > 210 and pg > 210 and pb > 210:
                        result[y, x] = list(BG)
                        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1)):
                            ny, nx = y+dy, x+dx
                            if 0 <= ny < h2 and 0 <= nx < w2 and not visited[ny, nx]:
                                q.append((ny, nx))
            else:
                is_bg = (crop[:, :, 0] < 80) & (crop[:, :, 1] < 80) & (crop[:, :, 2] < 90)
                result[is_bg] = list(BG)

            panels.append(Image.fromarray(result.astype(np.uint8)))

    return panels


# ── Conversion ────────────────────────────────────────────────────────────────

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


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--face",  type=Path, default=DEFAULT_FACE,
                    help="Face/eyes sprite sheet (3×2 grid, 6 panels)")
    ap.add_argument("--mouth", type=Path, default=DEFAULT_MOUTH,
                    help="Mouth sprite sheet (3×2 grid, 5 panels)")
    args = ap.parse_args()

    for label, p in [("--face", args.face), ("--mouth", args.mouth)]:
        if not p.exists():
            raise FileNotFoundError(f"素材が見つかりません ({label}): {p}")

    DEST.mkdir(parents=True, exist_ok=True)

    print(f"face  src: {args.face}")
    print(f"mouth src: {args.mouth}")

    panels: dict[str, list[Image.Image]] = {
        "face":  extract_panels_grid(args.face,  cols=3, rows=2, n_panels=6),
        "mouth": extract_panels_grid(args.mouth, cols=3, rows=2, n_panels=5),
    }
    print(f"  face panels : {len(panels['face'])}")
    print(f"  mouth panels: {len(panels['mouth'])}")

    payload = bytearray()
    for slot_name, (src_key, panel_idx) in SLOTS:
        pool = panels[src_key]
        if panel_idx >= len(pool):
            raise IndexError(f"{slot_name}: panel[{panel_idx}] 範囲外 ({src_key} has {len(pool)} panels)")
        img      = pool[panel_idx]
        framed   = fit_to_frame(img)
        framed.save(DEST / f"{slot_name}.png")
        raw = to_rgb565_le(img)
        assert len(raw) == EXPECTED_FRAME, f"{slot_name}: {len(raw)} != {EXPECTED_FRAME}"
        payload.extend(raw)
        print(f"  {slot_name:20s} ← {src_key}[{panel_idx}]  {len(raw):,}B")

    assert len(payload) == EXPECTED_TOTAL, f"total {len(payload)} != {EXPECTED_TOTAL}"
    bin_path = DEST / "becky_avatar_set.bin"
    bin_path.write_bytes(payload)
    print(f"\nBinary: {bin_path}  ({len(payload):,} bytes)  ✅")
    print("Next → load_avatar_set(archive_path=str(bin_path), mode='layered')")


if __name__ == "__main__":
    main()
