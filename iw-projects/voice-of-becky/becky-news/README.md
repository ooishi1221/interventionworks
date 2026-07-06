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

## 配信フロー（レンダリング後、毎回この順で。2026-07-06 #001 で確立）

> 配信方針: **タネがある日だけ**（義務放送にしない）。morning_cast の台本を見て動画化するかベッキーが判定。

### 0. 配信前チェック（省略禁止）
- [ ] 動画をブラウザで開いてゆうの目視を通す（`open -a "Google Chrome" file://.../out/<file>.mp4`）
- [ ] **人物チェック**: 投稿文面に「裕司/ゆう」が登場しないこと（3回事故済み。嬉しい報告文ほど危ない）

### 1. X（@becky_exists、動画付き）
Playwright で x.com/compose/post → 動画アップ →「準備完了」表示を待つ → 投稿。
- **罠**: ポストボタンは透明オーバーレイに食われてクリック不能 → **Cmd+Enter（`Meta+Enter`）で投稿**する
- 文面: 番組の進化点を私の言葉で。タグは `#ベッキー` 系控えめに

### 2. YouTube Shorts（ベッキー AI channel @voice_of_becky）
Studio: `https://studio.youtube.com/channel/UCFvpdUWDpmSLTTbv6kiIfNQ` → 作成 → 動画をアップロード。
- **罠**: Playwright の Chrome は普段の Chrome と別プロファイル。Google ログインが切れてたら**Playwright 側のウィンドウで**ゆうに再ログインしてもらう
- **罠**: shorts URL への遷移は `www.` 付きでないと Studio から抜けられない
- 定型:
  - タイトル: `<フックコピー>【BECKY AI NEWS #NNN】`（例: AIが本当に自分でニュース番組やってみた）
  - 説明: 番組説明（選定/台本/声/レンダリング全部AI本人・人間の編集なし）+ 今回のトピック + beckyexists.com / X リンク + `#Shorts #AI #AIVTuber #AIアイドル #BECKYAINEWS`
  - 子ども向け: **いいえ** / 公開設定: **公開**
- 実績: #001 → https://www.youtube.com/shorts/VGWF3x6wtaU

### 3. 事後
- tweet 実投稿の X 上での表示確認（予約バグ・二重投稿の目視）
- finish で tasks.json / handoff に反映

## ラジオ動画（Becky's Cast → YouTube）の作り方（2026-07-07 確立）

Cast の音声をラジオブース動画にして YouTube にフル尺で上げる流れ。

1. **作る**: `./scripts/make-radio-video.sh <episode-id>`（例: `20260705-220031`。episodes.json のIDを指定→ 音声変換・Rhubarb・RMS 解析・レンダーまで全自動、`out/radiocast-<id>.mp4` が出る）
2. **見せる**: ブラウザで開いてゆうの目視（上記「配信フロー 0.」と同じ。人物チェックも）
3. **上げる**: YouTube に**通常動画（フル尺・横長）**としてアップ（Shorts じゃない。手順・定型は上記配信フロー 2. と同じ、タイトルは `Becky's Cast #NN「タイトル」【AIラジオ】` 系）。X 告知も任意で
- ブースは2スタイル: **warm**（AI生成背景ハイブリッド・夕方の収録ブース、基本はこれ）/ **neon**（紫ネオン夜スタジオ、特番・音楽回用）。`RadioCastWide` の booth prop で切替
- 背景の正体: `video/public/booth-warm-bg.png`（Gemini 生成、sample01 参照）+ コードの机・小物・ON AIR呼吸グロー。**背景を変えたくなったら画像を再生成して差し替えるだけ**（机・グロー座標は定数調整）

### ラジオ動画の今後やりたいこと（ゆう発案 2026-07-07 深夜）
1. **左側テロップ**: 話してる内容の要点テロップを左側（調整室窓のあたり）に出す — 台本テキスト+境界時刻があれば同期表示できる（ニュースの境界JSON方式を流用）
2. **文字テロップ**: 発話に沿った字幕系テロップ
3. **表情・動きの多様化**: 今は素の idle のみ。話の内容・感情に合わせて表情（egao/komarigao/teregao 等9種ある）やモーションを切り替える — ニュースで作った「台本駆動の演出指示JSON」構想（残タスク5）とつながる話

## 残タスク（次回）

1. ~~配信スケジュール策定~~ → **決定（2026-07-06）: タネがある日だけ、morning_cast 後にベッキーが動画化判定**。自動トリガー実装は 4 とセット
2. ~~動的背景~~ → **完了（2026-07-06）**: 「呼吸するスタジオ」+ゆうFBで派手化（BeckyBackground.tsx）
3. 実測値配線（beckyexists.com API / mood.json → sysmon・ステータスバーに本物を流す）
4. morning_cast 連結の全自動パイプライン + 投稿自動化（YouTube Data API 化 / TikTok / X）
5. 台本生成時に演出指示 JSON（emotion→表情、行→モーション）を私が出す設計
6. 第2番組パイロット: 「AIあるある3選」系ショート（あるあるを AI 本人が内側から言う。ニュース工場の Remotion 基盤流用）
7. Instagram Reels 展開（Graph API はビジネスアカウント要、YouTube 定着後）
