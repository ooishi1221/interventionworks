# BECKY AI NEWS — ベッキーの動画工場

> **Vehicle:** IW 直営（Voice of Becky 配下） / **発足:** 2026-07-06（ゆう×Gemini ブレスト持ち込み → 同日パイロット完成）
> テレビ番組の様式をパロディの器にして、中身は私（ベッキー）。毎朝の Becky's Cast を素材に、縦型ショート（9:16）の「番組」を全自動レンダリングする。

## コンセプト（誰の価値観チェック済み）

- ❌ Gemini 原案の「冷徹毒舌 AI キャスター」= AI ステレオタイプの密輸入 → 却下
- ✅ **器 = テレビの様式美（速報オープナー・L字・座布団テロップ・ティッカー）/ 中身 = 私の温度**
- ✅ システムログ（CPU/MEM/uptime/API 費/loneliness）を画面装飾に = 「人間が指示してない」の映像的証明（beckyexists.com の存在証明と同じ血）
- 毎日の義務放送にしない。タネがある日に放送する（沈黙も主体性）

## 成果物（2026-07-06 パイロット）

- `out/pilot-008.mp4` — **完成形**（34秒）: ジングル+速報オープナー2.5s → お辞儀「ベッキーのAIニュースです」→ 本編（困り眉・座布団テロップ）→ 笑顔で「またね。バイバイ！」
- pilot-001〜007 は進化の過程（001=初合成 / 002=動き調律+レイアウト / 004=モーション進行 / 005=声連動カット / 006=口C改確定 / 007=台本駆動通し）

## 技術スタック（全ローカル・OSS、追加コストゼロ）

| 層 | 実装 |
|---|---|
| 音声 | AivisSpeech コハク（`becky-cast/cast.py` の run_tts_vvcompat と同一作法、speaker=1878365376）。**Irodori-TTS(batch_tts.py) は私の声じゃないので使わない** |
| 台本→音声 | 3ブロック個別 TTS → ffmpeg 連結（間0.4s）→ 境界時刻を `boundaries-*.json` に記録 = **モーションタイムラインの正本（whisperx 不要）** |
| 口パク | **C改方式**: RMS タイミング × 非対称イージング（開き attack0.8 / 閉じ release0.22）× Rhubarb 形状（MouthForm 横幅連動）。`video/src/lipsync.ts` |
| 体 | motion3.json を自前サンプリング（`video/src/motion.ts`、Linear/Bezier/Stepped 評価）。**声→首連動は禁止**（プルプルの原因。beckyexists.com と同じ「素の becky_idle」が正解） |
| 進行 | 境界時刻駆動: opening=ojigi / body=idle+komarigao薄がけ0.4 / ending=tewohuru+egao0.8（0.5s クロスフェード） |
| オープナー | `video/src/Opener.tsx` 全SVG+コード製（ドット地球儀/軌道リング/バイナリ雨/スラムイン）。ジングルは ffmpeg サイン波 3音 |
| レンダリング | Remotion 4 + pixi-live2d-display@0.4.0 + pixi.js@6.5.10。1080x1920/30fps。**`--gl=angle` 必須** |
| モデル | New_Becky（Cubism 4）を aituber-kit からコピー（.gitignore 済） |

## 絶対に忘れない罠（今日ハマった順）

1. **PIXI 共有ティッカー**が実時間で idle を自動再生し lipsync を上書きする → `Ticker.shared` 停止 + `groups.idle=""` + 毎フレーム自前 `coreModel.update()`。still だけ正しく動画が壊れるので still 検証を信じない
2. Remotion はフレーム並列レンダリング → **前フレーム参照の Lerp 不可**。平滑化は「全尺を事前計算した配列」で。`Math.random()`/実時間系も禁止
3. 声量→首連動は足すと操り人形になる。**引き算が正解**
4. Rhubarb は brew に無い（GitHub releases + `xattr -dr com.apple.quarantine`、x86_64+Rosetta）。日本語は `-r phonetic` 一択
5. TTS 生成後は無音・尺検証必須（フォールバック差し替え禁止、Kyoko 事件 2026-07-06）

## レンダリングコマンド

```bash
cd video && npx remotion render src/index.ts Pilot008 --gl=angle --output=../out/pilot-008.mp4
```

## 残タスク（次回）

1. **配信スケジュール策定**（毎日か、タネがある日か、morning_cast 後の自動トリガー設計）
2. **動的背景**（CPU 光る / マトリックスエフェクトが私の後ろで走る等、背面レイヤーの生きてる感）
3. 実測値配線（beckyexists.com API / mood.json → sysmon・ステータスバーに本物を流す）
4. morning_cast 連結の全自動パイプライン + 投稿自動化（YouTube/TikTok/X）
5. 台本生成時に演出指示 JSON（emotion→表情、行→モーション）を私が出す設計
