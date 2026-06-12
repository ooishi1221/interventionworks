#!/usr/bin/env python3
"""
becky-cast batch_tts.py — Irodori-TTS バッチ音声生成

モデルを1回だけロードして、manifest のチャンク群を順に合成する。
Irodori-TTS の venv で実行する前提:
  cd /Volumes/SSD2TB/Irodori-TTS && uv run python <このファイル> --manifest <manifest.json>

manifest 形式:
{
  "caption": "声のキャプション",
  "chunks": ["文1", "文2", ...],
  "output_dir": "/tmp/becky_cast_xxx",
  "seed": 42
}

出力: output_dir/chunk_0001.wav, chunk_0002.wav, ...
進捗は stdout に1行ずつ（cast.py が拾う）。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, "/Volumes/SSD2TB/Irodori-TTS")

from huggingface_hub import hf_hub_download

from irodori_tts.inference_runtime import (
    InferenceRuntime,
    RuntimeKey,
    SamplingRequest,
    save_wav,
)

HF_REPO = "Aratako/Irodori-TTS-600M-v3-VoiceDesign"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    caption: str = manifest["caption"]
    chunks: list[str] = manifest["chunks"]
    output_dir = Path(manifest["output_dir"])
    seed: int = manifest.get("seed", 42)
    output_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_path = hf_hub_download(repo_id=HF_REPO, filename="model.safetensors")
    runtime = InferenceRuntime.from_key(
        RuntimeKey(
            checkpoint=checkpoint_path,
            model_device="mps",
            codec_repo="Aratako/Semantic-DACVAE-Japanese-32dim",
            model_precision="fp32",
            codec_device="mps",
            codec_precision="fp32",
            codec_deterministic_encode=True,
            codec_deterministic_decode=True,
            compile_model=False,
            compile_dynamic=False,
        )
    )
    print(f"[batch_tts] model loaded, {len(chunks)} chunks", flush=True)

    for i, text in enumerate(chunks, start=1):
        result = runtime.synthesize(
            SamplingRequest(
                text=text,
                caption=caption,
                no_ref=True,
                # seed 固定で全チャンクの声を揃える（チャンクごとに声が変わるのを防ぐ）
                seed=seed,
            ),
            log_fn=None,
        )
        out = output_dir / f"chunk_{i:04d}.wav"
        save_wav(out, result.audio, result.sample_rate)
        print(f"[batch_tts] {i}/{len(chunks)} done ({len(text)} chars)", flush=True)

    print("[batch_tts] all done", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[batch_tts] ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
