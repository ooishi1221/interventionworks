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

## 次の伸びしろ（v1初聴後のゆうFB 7/5「うまい下手じゃなく、らしさ。感情の乗せ方と声質」で方向確定）
- **v2 = 声質 → 2026-07-16 達成**: 新ボイス素材でRVC再学習した `becky_v2`（200epoch、`logs/becky_v2/becky_v2_200e_17400s.pth`）が完成。ラジオ音声(元kohaku声)を変換したサンプルをゆうに聴かせ「こはくに似てるけどオリジナル」で合格判定。以後の歌唱カバー・声変換は `--pth_path logs/becky_v2/becky_v2_200e_17400s.pth --index_path logs/becky_v2/becky_v2.index` を使う（旧 `kohaku_becky` は退役）
- **v3 = 表現の「らしさ」（本丸）**: RVC は元歌唱の感情表現をそのまま通す＝現状は二層とも借り物。方向性: 歌唱合成でパラメータ設計（＝演じた感情、思想と不適合）ではなく、**mood 感情6変数→歌唱表現（テンポ揺れ・語尾・息量）の写像**——「その日の私が乗ってる歌」。becky_image の mood×シーン選択の歌版。判定器はゆうの耳（「ベキたんが歌ってる」と感じるか）
- 小物: index_rate / protect の耳合わせ、ハモリ（pitch ±3〜4 の重ね）

## v2 声質選定の再現（2026-07-15、素材ロスト後の復旧）

6/16に確定した`3.wav`はローカル・Colab両方から消失していた（Desktop整理で消えた）。journal記録から復旧手順を再現:

- Colabノートブック: `becky-voice-design.ipynb`（Google Drive、Voice-Design-Cloner = https://github.com/reinehonoka/Voice-Design-Cloner、モデル`Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`）
- 6/16と同じ英語プロンプトで3候補を再生成 → ゆうが`candidate_01.wav`を選定（「こはくにちょっと似てるトーンだから」7/15）
- 保存先: `~/Desktop/素材/べっキー新ボイス/becky_voice_v2_selected.wav`（`3.wav`という名前だけ何故か書き込み拒否されたため改名。他候補=candidate_02/03.wavも同フォルダに保持）
- **次のステップの発見**: このGradio UIには「ボイスクローン」「LoRA学習」タブもある。LoRA学習タブは「ボイスクローン」タブの出力フォルダを学習データとして読み込む設計だが、これはQwen3-TTS専用のLoRA（AivisSpeechとは別エンジン）になるため見送り、当初計画通りRVC学習のデータセット作りに「ボイスクローン」タブの一括生成だけを使う判断（既存パイプラインを変えずに声だけ差し替えられる）
- Colabランタイム・Gradio共有URLは1週間で失効するタイプ。次回作業時は再度ノートブックを実行し直す必要あり

## RVC学習用データセット準備完了（2026-07-15）

- 「ボイスクローン」タブで参照音声=becky_voice_v2_selected.wav、コーパス=`aika500.txt`（付属の日本語500文コーパス）から100文を一括生成（モデル`Qwen3-TTS-12Hz-1.7B-Base`、1文平均7.8秒・総音声時間12分59秒）
- Colabのカーネルは`!python app.py`実行中だと他セルがブロックされる制約に当たり、「実行を中断」でGradio UIを終了（生成済みデータはディスク上に残るため無害）→ シェル1行(`zip -r`)でzip化 → ファイルパネルからダウンロード
- ダウンロード先: `~/Desktop/素材/becky_rvc_dataset/clone/raw/`（0001.wav〜0100.wav）+ `clone/Neutral.txt`（書き起こしテキストリスト）
- 次: Applio(`/Volumes/SSD2TB/Applio/`)でこのデータセットを使いkohaku_becky後継のRVCモデルを学習（preprocess→extract→train）。既存のkohaku_becky学習実績が同ディレクトリにあるので同じ手順を踏襲。学習はGPU/CPU負荷が高いため、実行タイミングはMac miniの他タスクと調整

## 2026-07-17 — ラジオ声のコハク vs v2 対決の決着（重要決定）

**ラジオ=コハク続投で正式決定。** #35フル変換・index_rate 3段階(0.75/0.5/0.3)・VoiceDesign新候補9本(現行改良/可愛い若い/中間)・おっとり方向6本・承認済み声の感情文クローン、計5ラウンド全てゆうの耳がコハクを選んだ。プロ声優のスタジオ品質と1.7B合成声の実力差であり、現世代の道具では埋まらないと判断。**v2.1再学習は見送り**（半年後などTTS技術が進んだら再挑戦可）。v2(becky_v2)は歌・特番用として現役継続——歌はRVCが元歌唱の表現を通すのでNeutral学習の弱点が出にくい。

**副産物craft（次回の再挑戦時に使う）:**
- **Voice-Design-ClonerはローカルM4で完結する**（Colab不要！）: `/Volumes/SSD2TB/Voice-Design-Cloner/` に.venv(python3.12)構築済み。`Qwen3TTSModel.from_pretrained(..., device_map="mps", dtype=torch.float32)` でMPS動作、生成1本25〜40秒。Gradio UI不要で`generate_voice_design(text, language, instruct)`/`generate_voice_clone(text, ref_audio, x_vector_only_mode=True)`を直接呼べる。生成スクリプト例: 同dir `becky_v21_candidates.py`
- Colab free tierはランタイム回収・Gradioトンネル沈黙・UI自動化の罠(セル入力がGeminiコンポーザーに吸われる/monaco自動括弧補完)だらけで、もう使わない
- **学習データはApplioログに永続コピーがある**: Desktop素材が消えても `/Volumes/SSD2TB/Applio/logs/becky_v2/sliced_audios/`(672ファイル)から参照音声を復元可能。スライスは約4秒なのでffmpeg concatで7秒以上にしてx_vector refに使う
- クローン生成(Baseモデル)はinstruct(感情指示)非対応、VoiceDesignモデルのみ対応。感情つきコーパスを作るなら「クローン(声アンカー)+VoiceDesign感情指示(表情教材)」の混合方式が設計案としてある（未検証のまま見送り）
