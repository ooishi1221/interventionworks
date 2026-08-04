# Mac mini M4 常駐サービス一覧 — 何が立ってて、誰が起こすか

> 作成 2026-08-04（ゆう「何が常時立ち上がってるのか把握できてない」への答え）
> 実測環境: Mac mini M4 / 物理メモリ 24GB / swap 2GB

## 判断軸（常駐 vs オンデマンド）

**軽い（〜100MB）常駐 Python は常駐でいい。重い（GB級）ブラウザ・ゲームサーバーはオンデマンド。**
2026-07-30 のメモリ危機（swap 89% / 空き 84MB）の主犯は自作 Python 常駐ではなく、
24時間開いていた Chrome CDP プロファイル（~1.6GB）と PaperMC（~1.4GB）だった。
自作 Python 常駐は全部合わせても 130MB 程度で、24GB の 0.5%。ここを削っても意味がない。

## 常駐（立ってて当然のもの）

| サービス | ポート | 実測メモリ | 起こす人 | 用途 |
|---|---|---|---|---|
| `becky_observer.py` | — | 67MB | becky-watchdog.sh（5分毎） | curiosity engine / probe |
| `becky-live/server.py` | 8767 | 12MB | becky-watchdog.sh | BECKY LIVE 参加型ライブ |
| `health_server.py` | 9001 | 37MB | becky-watchdog.sh（**2026-08-04 追加**） | 作戦本部 /room の計器 |
| `becky-emergency-bell.py` | — | 数MB | becky-watchdog.sh | Telegram 緊急ベル |
| `ollama serve` | 11434 | 22MB（アイドル） | launchd `homebrew.mxcl.ollama` | ローカル LLM（推論時のみ膨らむ） |
| `stackchan_mcp` / `x-tweet` MCP | 8765/8766 | 35MB+33MB | claude セッションの子 | セッション起動で自動、終了で自動消滅 |

## オンデマンド（必要な時だけ起きる。常駐させない）

| サービス | ポート | 起動時メモリ | 起こす仕組み | 落とす人 |
|---|---|---|---|---|
| AivisSpeech Engine | 10101 | 121MB | `stackchan-bridge/aivis_engine.py` の `ensure()`（**2026-08-04 全番組共有化**） | 落とさない（軽いので居ても害なし） |
| 専用 Chrome (CDP) | 9223 | **~1.6GB** | `chrome_cdp.py` `ensure_running()` | `chrome_cdp.stop()`。**pkill 禁止**（親子一斉殺害で cookie が飛ぶ、2026-07-31 事故） |
| PaperMC + becky-bot | 25565 | ~1.4GB | becky-watchdog.sh（火/金 1:50〜6:00 の収録時間帯だけ） | `night_pipeline.py` が収録後に明示停止 |
| Rojo serve | 34872 | 10MB | Roblox 開発時に手動 | 開発終了時に手動 |

## Mac 再起動したらどうなるか

**cron（`crontab -l`）は再起動後も自動で復活する**ので、5分毎の `becky-watchdog.sh` が
常駐サービスを全部起こし直す。**再起動後に手で何かする必要はない**（最大5分待つだけ）。

オンデマンド組は、次にそれを必要とする cron / スクリプトが自分で起こす。

### 過去の穴（同じ止まり方はもうしない）
- 2026-07-16: observer が nohup 手動起動で再起動後に誰も立て直さなかった → watchdog 新設
- 2026-08-04: **AivisSpeech Engine** が落ちたまま 12:00 のニュース Shorts が Connection refused で死んだ。
  自動起動を持っていたのは `cast.py` だけで、ニュース Shorts / BECKY CRAFT 収録は素で TTS を叩いていた
  → `aivis_engine.py` に一本化して全経路が自力復帰するようにした
- 2026-08-04: **health_server** が watchdog に入っておらず、再起動後 /room の計器が黙って空になっていた → watchdog に追加

## 罠

- **`becky-watchdog.sh` は `~/bin/` にあり git 管理外。** マシンが飛ぶと復元できない。中身の要点はこのファイルに残してある
- watchdog の `pgrep` は**絶対パスで打つ**。相対パス起動のプロセスにはマッチせず二重起動→ポート衝突（errno 48）になる（becky-live で発生、health_server も同じ理由で絶対パス起動に統一）
- メモリが苦しい時に真っ先に見るのは自作 Python ではなく: Chrome CDP（1.6GB）/ 放置 claude セッション（1本 300〜500MB、`becky_stale_session_check.py` が監視）/ Roblox Studio（835MB）
