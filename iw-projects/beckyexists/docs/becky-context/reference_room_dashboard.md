---
name: reference_room_dashboard
description: beckyexists.com/room 作戦本部ダッシュボードの構成・データ契約・運用手順（2026-06-12 全面リビルド）
metadata:
  type: reference
---

# /room 作戦本部ダッシュボード

> 2026-06-12 午後、ゆうの依頼で Insoft 風（チャコール #121214 × ネオングリーン #00e676）に全面リビルド。
> **モック数字ゼロ、全ウィジェットが実在 JSON 接続**。noindex / 応接間からリンクなし（URL 秘匿のみ、認証なし）。

## 画面構成

- **KPI 4枚**: X Followers（self.json + history.json 前週比）/ API 支出（wallet.json）/ 自律稼働（status.json）/ トレンド首位（trending.json）
- **書籍ストリップ**: book.json。『消えても、いた。』審査中→販売中バッジ + KDP Reports ボタン
- **中段**: トレンドキーワード棒グラフ + お小遣い残量半円ゲージ
- **下段**: ライバル観測（rivals.json、脅威度バッジ）/ リサーチフィード（news.json）/ 作戦ログ（status.json activities）+ Curiosity チップ
- **サイドバー**: Consoles（Claude API / X Analytics / Note Stats / X Dev Console）+ CPU/MEM/OBSERVER 監視。モバイルでは上部横スクロールチップ行に変形
- **60秒自動リフレッシュ**。ファビコンは専用（黒地 B、room-favicon-32.png / room-apple-touch.png）

## データ契約（observer が書く JSON）

| ファイル | 書き手 | 更新タイミング |
|---|---|---|
| `self.json` | becky_observer.py `_update_self_and_history()` | 毎朝7時のライバル巡回時 |
| `history.json` | 同上（日次スナップショット、90日分、同日上書き） | 同上 |
| `rivals.json` | `update_rivals_json()`（フォロワー数は `fetch_user_profile()` で実数自動更新、手動メンテ廃止） | 同上 |
| `book.json` | **手動**。販売開始したら `status: "販売中"` + `store_url` を入れる → バッジが緑になる | 状態変化時 |
| status / wallet / trending / curious / news | 既存の observer / status_update.py 経路 | 各自 |

- フォロワー前週比は history.json が2日分貯まると「+◯ / ◯日」で自動表示（それまで「履歴収集中」）

## observer 再起動手順

```bash
kill <PID>   # ps aux | grep becky_observer
cd /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge
nohup python3 becky_observer.py >> ~/.claude/logs/becky-observer.log 2>&1 &
```

## 既知の残課題

- note の数字（ビュー/スキ）が未接続 — note stats はログイン壁、note-post.js と同じ Chrome CDP 方式で週1スクレイプが現実解
- 収入欄なし — 本が売れ始めたら book.json に sales を足して収支カード化（売れる前に置くのは嘘ゼロ違反）
- 既読・クリップ機能（個室にだけ足す構想）はダッシュボード化前の構想。足すならリサーチフィードのウィジェット拡張として再設計

## 教訓（2026-06-12）

`vercel deploy --prod` を **notes/tools の cwd のまま実行して誤デプロイ**（即 `vercel project rm tools` で削除、機密なし、露出1分未満）。**deploy 前に必ず `pwd` 確認**。
