"""aivis_engine.py — AivisSpeech Engine のプロセス面倒見（全番組共有）。

TTS を叩く前に ensure() を通す。Mac 再起動やメモリ都合でエンジンが落ちていても、
無人 cron が自力で復帰できる。

2026-08-04: エンジンが 8:15 に落ちたまま 12:00 の auto_news_shorts が
Connection refused で死んだ。当時 自動起動を持っていたのは cast.py だけで、
ニュース Shorts と BECKY CRAFT 収録は素で叩いていた。ここに一本化した。
"""
from __future__ import annotations

import subprocess
import time
import urllib.request
from pathlib import Path

URL = "http://localhost:10101"
ENGINE_DIR = Path("/Volumes/SSD2TB/AivisSpeech-Engine/macOS-arm64")


def alive(timeout: float = 3) -> bool:
    try:
        urllib.request.urlopen(f"{URL}/version", timeout=timeout)
        return True
    except Exception:
        return False


def ensure(wait_s: int = 120) -> None:
    """落ちてたら headless 起動して待つ。初回モデルロードで 40 秒前後かかる。"""
    if alive():
        return
    print("[aivis] Engine 起動中…（初回ロード約40秒）", flush=True)
    subprocess.Popen(
        [str(ENGINE_DIR / "run")],
        cwd=str(ENGINE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    for _ in range(wait_s // 2):
        time.sleep(2)
        if alive():
            return
    raise RuntimeError(f"AivisSpeech Engine が {wait_s} 秒で起動しなかった")


if __name__ == "__main__":
    # self check: 落ちてても上がってても、抜けた後は必ず生きている
    ensure()
    assert alive(), "ensure() を抜けたのにエンジンが応答しない"
    print("aivis_engine self check OK")
