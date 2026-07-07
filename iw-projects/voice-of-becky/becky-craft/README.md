# becky-craft — ベッキー Minecraft 自律実況システム

観測(HTTP) → LLM(claude-sonnet-5, structured output) → 行動(HTTP) → 実況セリフ、のループ。

## 構成

| 層 | 場所 | ポート |
|---|---|---|
| PaperMC 1.21.4 サーバ | `server/` | 25565 |
| Mineflayer bot（行動API + 一人称viewer） | `bot/becky-bot.js` | 3008 (API) / 3007 (viewer) |
| 思考ループ | `brain/becky_brain.py` | — |

## 起動手順（この順で）

```bash
# 1. サーバ（Java: /opt/homebrew/opt/openjdk = JDK26。spark は paper-global.yml で無効化済み）
cd server && nohup ../scripts/start-server.sh > server.log 2>&1 &
# "Done (x.xs)!" が出るまで待つ（tail -f server.log）

# 2. bot
cd bot && nohup node becky-bot.js > bot.log 2>&1 &
# "[bot] spawned" と "action API on :3008" を確認

# 3. 思考ループ（--max-calls 必須の安全装置、デフォルト30）
cd brain && python3 becky_brain.py --max-calls 5 --interval 10
```

- 一人称視点: http://localhost:3007
- 観測: `curl localhost:3008/observe` / 行動: `curl -X POST localhost:3008/action -H 'Content-Type: application/json' -d '{"type":"dig_nearest","args":{"blockName":"oak_log"}}'`

## 本番収録（YouTube cut まで1コマンド）

```bash
# 10分番組 → 頭トリミング+OP/ED合成済みの yt-*.mp4 まで自動生成
/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge/.venv/bin/python3 \
  scripts/record-episode.py --time-budget 600 --out becky-craft-epXXX.mp4
```

- **エピソード番号/タイトル/GOAL は `record-episode.py` 冒頭の `EP_NUM` / `EP_TITLE` / `GOAL` / `HUD_GOAL` を書き換える**（OP/ED カードに自動焼き込み）
- time_budget 指定で毎ターン「残り秒」が観測に注入され、ベッキーが残り90秒で自分から締めて「バイバイ」+stop で終わる
- ED リザルト（生存時間/デス数+一言/ハイライト/次回煽り）は収録ログから LLM 1コールで自動生成
- **収録前クリーンアップ**（Becky は ops 登録済み）: `/kill @e[type=item]` → **`/kill @e[type=!player,type=!item,distance=..48]`（敵mob掃除。忘れるとTP先で即死する——EP.004で鉄5個全ロスの実績）** → `/clear` → `/fill <範囲> air replace crafting_table` → `/tp` → `/time set 3000`（朝スタート=終盤に夕暮れの時間割）
- 声の演技: LLM が毎ターン voice{volume,speed,pitch} を出力 → `becky_voice.voice_to_aivis()` で写像（正本: `../docs/voice-tone-design.md`）
- 思考先読み（lookahead=True デフォルト）: 行動をスレッド実行し、bot が動いている間に次を考える。EP.001 の直列カクカクに戻すには `lookahead=False`

## ワイプ（Live2Dバストアップ、EP.006〜）

```bash
# 1. 収録後、events を Remotion へ渡す
python3 -c "import json; ev=json.load(open('out/episode_audio.json')); json.dump([{'t':e['t'],'dur':e['dur'],'vol':e.get('vol',1.0)} for e in ev], open('../becky-news/video/public/craft-events.json','w'))"
# 2. 透過ワイプをレンダ（VP8+alpha。ProRes 4444 は Remotion 4.0.290 で alpha 不可）
cd ../becky-news/video && npx remotion render CraftWipe /tmp/wipe.webm --codec=vp8 --pixel-format=yuva420p --gl=angle --concurrency 10
# 3. 本編に右下合成（libvpx 指定必須、無いと alpha が黒落ち）
ffmpeg -y -i out/becky-craft-epXXX.mp4 -c:v libvpx -i /tmp/wipe.webm -filter_complex "[1:v]scale=300:-1[w];[0:v][w]overlay=W-w-12:H-h-8[v]" -map "[v]" -map 0:a -c:v libx264 -pix_fmt yuv420p -c:a copy out/becky-craft-epXXX-wiped.mp4
# 4. wiped.mp4 を build_youtube_cut に渡して完全版を組む
```

口パクは簡易正弦（Rhubarb化はCraftWipe.tsxのmouthAt差し替え）。表情=voice.volume写像。正本: `becky-news/video/src/CraftWipe.tsx`

## 公開エピソード

| EP | タイトル | URL | 備考 |
|---|---|---|---|
| 001 | はじまりの日 | https://www.youtube.com/watch?v=NIf3LvNo6io | 直列思考のカクカク=成長アークの初期値として意図的に保存 |
| 002 | はじめてのクラフト | https://www.youtube.com/watch?v=xkK8iFGtmkQ | クラフト解禁+並列思考+自動回収。ドラウンド3体夜戦 |

## 罠

- **JDK26 × spark(async-profiler) は SIGSEGV でサーバごと落ちる** → `server/config/paper-global.yml` の `spark.enabled: false` が正本（`-Dspark.disableBackgroundProfiler=true` は効かない）
- **prismarine-viewer の上限は MC 1.21.4**（mineflayer 自体は 1.21.11 まで対応）。Paper を上げるときは viewer の supportedVersions を先に確認
- **viewer のスクショは headless Chrome だと真っ白**（WebGL）。Playwright（browser_navigate → 10秒待ち → screenshot）で撮る
- **headless Chromium の既定は SwiftShader（CPU描画）で 26fps** → 録画がカクつく。`--enable-gpu --use-angle=metal --ignore-gpu-blocklist` で Apple Metal 60fps（実測 2.3倍、record-episode.py 適用済み）
- **プロンプトキャッシュ**: system が短い（Sonnet 5 の最小キャッシュ 2048 tokens 未満）ため今は cache_read=0。人格プロンプトを本番化して長くなれば自動で効く
- **mineflayer 4.37 × 1.21.4 は作業台クラフトが無言で失敗する**（done を返すのに材料が減らない）→ bot の craft はインベントリ実数を検証し、失敗時はレシピの delta 通りに /clear+/give で等価実行（正直な素材不足エラーも返す）
- 素手で石を掘るとドロップしない → dig_nearest が bestHarvestTool を自動装備
- 掘った後はドロップ位置へ自動で歩いて回収する（EP.001 でホットバーが空だった対策済み）

## API 認証

`stackchan-bridge/stop_hook_tts.py` の `load_config()` → `becky_api_key`（becky_llm.py と同方式）。
