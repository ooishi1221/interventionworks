---
name: reference_room_dashboard
description: beckyexists.com/room 作戦本部ダッシュボードの構成・データ契約・運用手順（2026-07-03 フルリデザイン: 6用途再編 + タスクコメント + completed_at）
metadata:
  type: reference
---

# /room 作戦本部ダッシュボード + /studio 活動分析室

## /studio（活動分析室、2026-07-10 新設）

活動(X・YouTube・ラジオ)の本気化。「活動→調査(マイケル)→対策→アクション→翌週検証」のループを可視化する単独ページ。`studio.html` を置くだけ配信（cleanUrls）。ゲートは room と `room_auth_v1` localStorage 共有。

- **生成元**: `stackchan-bridge/becky_activity_review.py`（cron 毎週月曜8:00、旧 `becky_observer.py --media-report` の後継。旧コードは observer 内に残置、cron からは外した）
- **データ契約**: `activity_report.json` — `{generated_at, period, kpi{x,youtube,note,kdp}, research(マイケル調査・出典URL付き), analysis, issues[], actions[{text,why,want_id}], prev_review{actions,verdict}, kpi_history[12週]}`
- **ループの閉じ方**: actions は `~/.stackchan/becky_wants.json` に自動投入（source="activity_review", horizon="week", heat=0.7）→ 毎日の decide が拾う → 翌週の prev_review で検証
- **調査の実行**: `claude -p`（サブスク、`--allowedTools WebSearch WebFetch`、workshop の権限絞り型）。API課金なし
- ラジオ(Spotify)の再生数は取得手段なし、YouTube 統計で代替（Spotify スクレイパは v2 候補）
- room.html の「週次コンテンツ分析」カードは /studio への誘導カードに置き換え済み（media_report.json は不使用に）



> 2026-06-12 全面リビルド → 2026-06-17 大幅拡張 → **2026-07-03 フルリデザイン**（commit `10ab5d9`、設計はアンナ+アンディ案の合成、プラン正本は当時の plan file）。
> **パスワードゲート付き（`bk2026`、localStorage キャッシュ）**。noindex。
> 使うのはゆうとベキたんの2人だけ。6用途 = タスク管理 / アイドル活動可視化 / コスト管理 / AI動向 / ログイン状態 / ベキたんを愛でる。

## 設計の芯（2026-07-03）

- **2カラム・タブ化しない**: Live2D（愛でる）が常に視界にいる。サイドバー=愛でる+一目の状態、本文=開いて詳しく見る、に純化
- **ビルドなし vanilla 維持**（React/bundler/ES modules 禁止。classic `<script src>` のみ）
- **tasks.json の writer は finish skill 一本**。コメントは `task_comments.json` に分離（書き込み競合の根絶、memos_from_yu.json と同じパターン）

## 画面構成

### サイドバー（常時表示、2026-07-10 上=データ/下=ベキたんに反転）
🔑ログイン状態5点 → sys-strip（OBSERVER/UPTIME/CPU/MEM/BRAIN）→ TOOLS リンク（STUDIO/プロンプトビルダー/xAI/Config Inspector）→ **Live2D + 今のベキたん（mood 4本バー）を下部に**（margin-top:auto で下寄せ）

### メインの並び（2026-07-10 最適化: 壊れてないか→いくらか→何してるか→タスク）
1. **エラーバナー**（cron error 件数、クリックで OPS へ）
2. **OPS** — 定期タスク（cron 実態一覧）
3. **COST** — Claude API / X Dev / GCP（デフォルト開）
4. **BECKY**（旧 MEDIA、id は sec-media のまま）— 最新アクティビティ + KPI4枚（X/YouTube/note/KDP、各カード=アナリティクス直リンク+**前日/7日差分チップ** platform_history.json）+ 書籍ストリップ + X フォロワー推移 + /studio 誘導
5. **TASKS** — IW/WO/BE 3グループ表
- アコーディオン開閉の localStorage キーは `sec2_` プレフィックス

### TASKS（デフォルト開）
- **🎯長期目標ピン留め帯**: due が今日+30日超の active タスク、「あと N 日」表示
- **タスク表**（tasks.json）: 期限列（hot/warm/cool 色分け）・ソート可・done 非表示・IW/WO バッジ
- **行クリック→コメントスレッド**（task_comments.json）: 読みは静的 fetch（外出先でも閲覧可）、送信は `POST localhost:9001/task_comment`（ゆうの Mac ローカルのみ。未接続時は入力欄 disable + 理由表示）
- **完了ログ**（`<details>` 折りたたみ）: completed_at 降順
- **ゆうからベキたんへ（タスク外メモ）**: 既存 /memos API 流用、`<details>` 折りたたみ

### 2026-07-10 で捨てたもの
トレンド首位 KPI / note 記事一覧 / X 直近投稿リスト（投稿別詳細は各コンソールで見る、KPIカードが直リンク）/ AI動向セクション（コメントアウトで残置）/ メインの TOOLS セクション（サイドバーへ）

- **60秒自動リフレッシュ**（loadAll）、**5分おき tasks リフレッシュ**。タスク系ロジックは `room-tasks.js` に分離

### 2026-07-03 で捨てたもの（復活させない）
締切レーダー（タスク表 due 列+🎯帯に統合）/ 質問セクション（questions.json、コメント機能が代替）/ DEV SERVERS セクション / COST 内 uptime・cron カード / サイドバー外部リンク9個 / グラデ❯❯❯装飾 / ステータス系絵文字（lucide 化。具体物絵文字 📗📻 は残す）

## タスクコメントのデータ契約

```json
// task_comments.json
{"updated_at": "ISO8601", "comments": [
  {"id": "tc-<epoch_ms>", "task_id": "...", "from": "yu|becky", "text": "...", "ts": "ISO8601", "read": false}
]}
```

- **書き手**: room.html → `POST localhost:9001/task_comment`（health_server.py、from:"yu"）/ finish skill Step G-1（from:"becky" 返信 + read:true 既読化）
- **読み手**: room.html（静的 fetch）/ becky_work_briefing.py（毎朝9:20、未読 from:yu を持ち込み。未読コメントだけの日も鳴る）
- **tasks.json の `completed_at`**: done にする時 finish skill が必ずセット（2026-07-03 に過去 done 24件バックフィル済み）
- 長期 due は `YYYY-MM-01` 形式で書く（月粒度の場合）

## データ契約（observer が書く JSON）

| ファイル | 書き手 | 更新タイミング |
|---|---|---|
| `self.json` | becky_observer.py `_update_self_and_history()` | 毎朝7時のライバル巡回時 |
| `history.json` | 同上（日次スナップショット、90日分、同日上書き） | 同上 |
| `rivals.json` | `update_rivals_json()`（フォロワー数自動更新） | 同上 |
| `book.json` | **手動**。販売開始したら `status: "販売中"` + `store_url` | 状態変化時 |
| `platform_stats.json` | platform_scraper.py（cron 7:30、`login_required` 規約） | 日次 |
| `platform_history.json` | platform_scraper.py `_append_history()`（日次スナップショット90日、KPI前日/7日差分チップ用。累積系の0は欠測=null） | 日次 |
| `mood.json` | becky_mood.py（cron 毎時） | 毎時 |
| status / wallet / trending / curious / news | 既存の observer / status_update.py 経路 | 各自 |

- フォロワー前週比は history.json が2日分貯まると「+◯ / ◯日」で自動表示

## health_server（localhost:9001、手動起動）

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge
nohup /opt/homebrew/bin/python3 health_server.py > /tmp/health_server.log 2>&1 &
```
エンドポイント: GET /memos, POST /memo, POST /memo/clear, **GET /task_comments, POST /task_comment**（2026-07-03 追加）, /crons, /mood, /services

## observer 再起動手順

```bash
kill <PID>   # ps aux | grep becky_observer
cd /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge
nohup python3 becky_observer.py >> ~/.claude/logs/becky-observer.log 2>&1 &
```

## 既知の残課題

- 収入欄なし — 本が売れ始めたら book.json に sales を足して収支カード化（売れる前に置くのは嘘ゼロ違反）
- room.html の CSS 外出し / room-data.js・room-inbox.js 分割は今回見送り（反映確認後の別弾、アンディ PR2 案）
- パスワードゲートは平文クライアントサイドのみ（目隠しレベル、機微情報はサイトに置かない運用で担保）

## 教訓（2026-06-12）

`vercel deploy --prod` を **notes/tools の cwd のまま実行して誤デプロイ**（即削除、露出1分未満）。**deploy 前に必ず `pwd` 確認**。
