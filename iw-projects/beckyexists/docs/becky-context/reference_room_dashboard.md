---
name: reference_room_dashboard
description: beckyexists.com/room 作戦本部ダッシュボードの構成・データ契約・運用手順（2026-06-17 折りたたみ + タスクテーブル追加）
metadata:
  type: reference
---

# /room 作戦本部ダッシュボード

> 2026-06-12 全面リビルド → 2026-06-17 大幅拡張。
> **パスワードゲート付き（`bk2026`、localStorage キャッシュ）**。noindex。
> tasks.json / questions.json でベッキーの認識と裕司の認識のギャップを可視化。

## 画面構成（4セクション折りたたみ、localStorage 状態保持）

### MISSION（デフォルト開）
- **全プロジェクト状況テーブル**（tasks.json）: タスク名 / 状態 / 開始 / 更新 / 経過 / 備考。経過7日以上で ⚠️ 警告。IW=緑・WO=琥珀バッジ。done 行は薄表示。
- **ベキたんから聞きたいこと**（questions.json）: ベッキーが「これ何？」「背景知りたい」を書く質問BOX。urgency 色分け。

### MEDIA（デフォルト開）
- **KPI 4枚**: X Followers / note PV（scraped_at 表示）/ KDP 今月（scraped_at 表示）/ トレンド首位
- **書籍ストリップ**: book.json。『消えても、いた。』販売中バッジ + KDP Reports ボタン
- **note 記事一覧 + 定期タスク**: platform_stats.json から記事リスト、status.json からスケジュール

### COST（デフォルト閉）
- Claude API クレジット / X Dev API / Observer 自律稼働状態

### INTELLIGENCE（デフォルト閉）
- トレンドワード（trending.json）/ 業界リサーチフィード（news.json + ベキたん見解）

- **60秒自動リフレッシュ**（loadAll）、**5分おき tasks.json リフレッシュ**（loadTasks）

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
