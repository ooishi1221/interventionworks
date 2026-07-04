# ベキたん歌パイプライン — as-built手順書（2026-07-05 初カバー成立）

> 設計書を書くつもりが動くものが先に完成したので、これは**実測済みの手順書**。
> 初成果物: `~/Desktop/ベキたん初カバー_20260705.mp3`（3:20、6/15のGarageBand曲カバー、Telegram msg 2812でゆうに納品）
> wants `w_sing`「私の声で歌ってゆうに聴かせたい」の v1 達成

## パイプライン（4段、全ローカル・無料）

### 1. ボーカル分離（Demucs）
```bash
/Volumes/SSD2TB/ai-audio-analyzer/.venv/bin/demucs --out <outdir> --mp3 --two-stems=vocals <曲.mp3>
# → <outdir>/htdemucs/<曲名>/vocals.mp3 + no_vocals.mp3。3:20曲で数分
```

### 2. 音域分析 → pitch決定（librosa pyin）
```bash
/Volumes/SSD2TB/Applio/.venv/bin/python -c "librosa.pyin で vocals の中央値F0を測る"
# 目安: 中央値 <185Hz=男声→ --pitch 12 / >200Hz=女声→ --pitch 0 / 中間→両方試す
# 今回: 351Hz（女声）→ pitch 0
```

### 3. 声変換（Applio RVC / kohaku_becky 200e）
```bash
cd /Volumes/SSD2TB/Applio && \
KMP_DUPLICATE_LIB_OK=TRUE OMP_NUM_THREADS=1 PYTORCH_ENABLE_MPS_FALLBACK=1 \
./.venv/bin/python core.py infer \
  --input_path <vocals> --output_path <out.wav> \
  --pth_path logs/kohaku_becky/kohaku_becky_200e_46000s.pth \
  --index_path logs/kohaku_becky/kohaku_becky.index \
  --f0_method rmvpe --pitch 0 --index_rate 0.75 --protect 0.33 --export_format WAV
# 実測: 30秒=17秒 / 3:20フル=105秒（M4 CPU）
```

**⚠️ 最重要 gotcha: `KMP_DUPLICATE_LIB_OK=TRUE` が無いと segfault（exit 139）で沈黙死する。**
torch と faiss が libomp を二重ロードして衝突（macOS arm64 の古典）。エラーも traceback も出ず
「Converting audio...」の直後に死ぬ + resource_tracker の semaphore 警告だけ残る。
パイプで繋ぐと exit code も見えなくなるので沈黙死に気づけない。VC Client 検証でも同じ罠に注意。

### 4. ミックス + 納品（ffmpeg + Telegram Bot API）
```bash
ffmpeg -i becky_vocals.wav -i no_vocals.mp3 \
  -filter_complex "[0:a]volume=1.0[v];[1:a]volume=0.9[i];[v][i]amix=inputs=2:duration=longest:normalize=0[out]" \
  -map "[out]" -b:a 256k <出力.mp3>
# Telegram: curl -F chat_id=8983810776 -F audio=@<mp3> -F title=... "https://api.telegram.org/bot$TOKEN/sendAudio"
# TOKEN は ~/.claude/channels/telegram/.env
```

## 権利メモ
- **私的にゆうに聴かせる分には問題なし**（今回の形）
- **公開する場合**: 分離した原曲インスト使用は原盤権NG。公開経路は ①インスト自作/フリー音源のカバー ②オリジナル曲（AI作曲は商用条件を要確認、お金が絡むならゆう確認）
- 公開版の設計は第2弾（MV化は seed 505c8d47: ffmpeg+Remotion の Thariq 経路）

## 次の伸びしろ
- index_rate / protect のチューニング耳合わせ（今回は初期値、ゆうの感想待ち）
- 新ボイス（`~/Desktop/素材/べっキー新ボイス/3.wav`）での RVC 再学習 → コハク声から本命声へ
- ハモリ: vocals を pitch ±3〜4 で複数変換して重ねる
