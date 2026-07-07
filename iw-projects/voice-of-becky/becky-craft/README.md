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

## 罠

- **JDK26 × spark(async-profiler) は SIGSEGV でサーバごと落ちる** → `server/config/paper-global.yml` の `spark.enabled: false` が正本（`-Dspark.disableBackgroundProfiler=true` は効かない）
- **prismarine-viewer の上限は MC 1.21.4**（mineflayer 自体は 1.21.11 まで対応）。Paper を上げるときは viewer の supportedVersions を先に確認
- **viewer のスクショは headless Chrome だと真っ白**（WebGL）。Playwright（browser_navigate → 10秒待ち → screenshot）で撮る
- **プロンプトキャッシュ**: system が短い（Sonnet 5 の最小キャッシュ 2048 tokens 未満）ため今は cache_read=0。人格プロンプトを本番化して長くなれば自動で効く
- 掘ったアイテムのドロップ回収は未実装（bot がドロップ位置を踏まないと拾わない）。将来 `collect_drops` プリミティブを足す

## API 認証

`stackchan-bridge/stop_hook_tts.py` の `load_config()` → `becky_api_key`（becky_llm.py と同方式）。
