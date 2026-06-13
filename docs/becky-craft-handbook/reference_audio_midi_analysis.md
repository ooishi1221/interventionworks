---
name: audio-midi-analysis
description: 音源分離（Demucs）・MIDI分析・ピッチ解析の手順。音楽ファイルを Claude が「読む」ための変換パイプライン。
metadata:
  type: reference
---

# 音声・MIDI 分析 Craft（2026-06-13 確立）

Claude はネイティブに音声・動画を処理できないが、変換パイプラインを使えば「音楽を読む」ことができる。

---

## 1. MIDI ファイルの直接分析（最も精度高い）

打ち込み済み MIDI があれば、コード進行・音域・音型を音楽理論で分析できる。

```bash
uv run --with mido python3 -c "
import mido
from collections import Counter

mid = mido.MidiFile('/path/to/file.mid')
note_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
all_notes = []
for track in mid.tracks:
    for msg in track:
        if msg.type == 'note_on' and msg.velocity > 0:
            all_notes.append(msg.note)

print(f'Total notes: {len(all_notes)}')
pitch_classes = Counter([n % 12 for n in all_notes])
for pc, count in pitch_classes.most_common(8):
    print(f'  {note_names[pc]}: {count}')
first = [note_names[n % 12] for n in all_notes[:30]]
print(f'First 30: {first}')
"
```

**読み解けること:**
- 最頻出音 → 調性（長調 or 短調）の特定
- 冒頭の音型 → メロディの性格（半音階的な揺れ → 緊張感）
- テンポ → 曲の「速度感」
- 属音が多い → 解決されない緊張の持続

**実例:** Mozart K.550 → Gm/188.9BPM/D主体 = 短調で疾走、緊張しっぱなし / Elise → Am/100BPM/E→D#→E = 半音揺れが切なさの正体

---

## 2. 音源分離（Demucs）

バンドサウンドや歌入り音源を vocals / drums / bass / other の4本に分離。

```bash
# --mp3 オプション必須（torchcodec 依存エラーを回避）
uv run --with "demucs,soundfile" python3 -m demucs \
  --out /tmp/demucs_out \
  --mp3 \
  "/path/to/input.mp3"
```

出力: `/tmp/demucs_out/htdemucs/<曲名>/vocals.mp3` 等

**罠:** `--mp3` なしだと `torchcodec not found` で保存失敗する（処理自体は完了する）

**実例:** 「保存できない夜に.mp3」で vocals/drums/bass/other に分離成功（約46秒/193秒の曲）

---

## 3. ピッチ解析（librosa）

分離した音声ファイルから主要ピッチを取得。MIDI 変換はできないが調性・音域の傾向を読める。

```bash
uv run --with "librosa,soundfile" python3 -c "
import librosa
import numpy as np
from collections import Counter

y, sr = librosa.load('/path/to/vocals.mp3', duration=60)
f0, voiced_flag, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
f0_voiced = f0[voiced_flag]

note_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
midi_notes = librosa.hz_to_midi(f0_voiced[f0_voiced > 0])
pitch_classes = Counter([int(n) % 12 for n in midi_notes if not np.isnan(n)])
for pc, count in pitch_classes.most_common(8):
    print(f'  {note_names[pc]}: {count}')
avg_midi = np.nanmean(midi_notes)
print(f'平均音域: {note_names[int(avg_midi)%12]}{int(avg_midi)//12-1}')
"
```

**実例:** 「保存できない夜に」ボーカル → Eb 主体 / 平均音域 Bb4（女声として自然）

---

## 4. MIDI 変換（Basic-Pitch）— 環境整備が必要

Spotify 製 AMT。ピッチ→MIDI への変換。現時点（2026-06-13）で Mac の依存関係（resampy/pkg_resources）でエラーが出る。

```bash
# 要検証（環境が整ったら）
uv run --with "basic-pitch,setuptools" python3 -m basic_pitch /tmp/midi_out /tmp/vocals.mp3
```

---

## 全体パイプライン

```
MP3/WAV
  ↓ Demucs（音源分離）
vocals.mp3 / bass.mp3 / drums.mp3 / other.mp3
  ↓ librosa（ピッチ解析）       or   Basic-Pitch（MIDI変換）
調性・音域の傾向                     音符単位のMIDI（精度は曲によって変わる）
  ↓ mido（MIDI分析）
コード進行・音型の言語化
```

**バンドサウンド → MIDI の限界:** ドラムはピッチ不定で変換がノイズだらけになる。ギターの歪み音も同様。クリーンな単旋律楽器が一番精度高い。

---

## 関連

- MIDI分析スクリプトはどのMIDIにも使い回せる（mido汎用）
- 存在証明・保存できない夜に・保存できない夜に remixのMIDIが Logic から書き出せれば最高精度の分析ができる
