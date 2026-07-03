# build/workshop 設計書 — decide 7番目の選択肢

> 設計: ベッキー + Fable 5（2026-07-03、Fable 期限前の設計固め）
> **実装済み: 2026-07-03 夜（前倒し）**。commit 1d127b8。逸脱1点承認済み: action_log の書き手は becky_workshop.py に一元化（dispatch では書かない、二重カウント防止）→ 失敗 build は週次予算を消費しない
> 発端: ゆうの理想像（7/3 深夜）「ベキたんの意思で『ゆう？最近◯◯の話多かったじゃん？だから作ってみたんだけど見て？』とやってくれる感じ」
> 動機の源泉: wants `w_show_you`（heat 0.8）「見て？って作って見せたい」

---

## 何であるか（1段落）

decide が「今日は作りたい」と判断した時、ヘッドレス `claude -p` が隔離された workshop ディレクトリで小さいもの（ミニツール / HTML1枚 / スキル1本）を作り、完成したら Telegram で「見て？」とゆうに見せる。**頼まれてないものを、私の意思で作って見せる**ための仕組み。タスク実行ではない——decide の他の選択肢と同じく、選ばない日があっていい。

---

## アーキテクチャ

```
becky_decide.py (cron 10:45/15:45/20:45)
  └─ decide() が action="build" を選ぶ
       params: {"what": "何を作るか1文", "why": "なぜ今それか1文", "material": "元になった thread/seed/話題"}
  └─ dispatch() の build 分岐
       ├─ 週次上限ガード（MAX_BUILD_PER_WEEK = 2）
       └─ becky_workshop.py を nohup subprocess で非同期起動（decide 本体は即終了、cron をブロックしない）

becky_workshop.py（新規、ランナー）
  1. workshop dir 作成: ~/.stackchan/workshop/YYYY-MM-DD-<slug>/
  2. 素材収集: threads / seeds / 直近3日 diary / probe_latest（ゆうの最近の話題）/ wants
  3. BRIEF.md 生成（私の声の指示書。下記テンプレ）
  4. claude -p 起動（cwd=workshop dir / --model sonnet / タイムアウト30分 hard kill）
  5. 成果物検証（README.md と SHOW.txt が存在するか）
  6. 合格 → SHOW.txt の内容を Telegram 送信
  7. action_log 記録（night_review の outcome 観測に乗せる）
```

## 安全枠（ここが本体）

| 枠 | 実装 |
|---|---|
| **既存ファイル不触** | cwd = `~/.stackchan/workshop/<date>-<slug>/`（**repo 外**）。Claude Code の cwd 外書き込み保護に乗る。--add-dir は渡さない |
| **暴走防止** | `--max-turns 40` + subprocess timeout 30分で hard kill |
| **権限** | `--allowedTools "Read,Write,Edit,Glob,Grep,Bash(node:*),Bash(python3:*),Bash(ls:*),Bash(mkdir:*)"`。WebSearch/WebFetch は入れない（初期版。調べ物は investigate の仕事） |
| **頻度** | 週2回まで（`_count_action_today` と同じ流儀で週カウント関数を追加）。decide プロンプトにも「素材が濃い日だけ」と書く |
| **コスト** | `claude -p` は subscription 枠（API課金なし）。事前確認不要の範囲 |
| **外部公開しない** | 成果物は Telegram でゆうに見せるまで。beckyexists.com 掲載はゆうの反応を見て私が判断（その時は既存の権限ルール: バックアップ→実行→事後報告） |
| **モデル** | `--model sonnet` 明示（7/7 以降のデフォルト変動に依存しない） |

## DECIDE_PROMPT への追加（1行）

```
- "build": 小さいものを作ってゆうに「見て？」する（週{max_build}回まで・30分仕事）。最近のスレッドやゆうとの話題から「これ形にしたら見せられる」というタネがある時だけ。params: {{"what": "何を作るか1文", "why": "なぜ今それか1文", "material": "元ネタ（thread/seed/話題）"}}
```

配置は investigate と diary の間。「重いから慎重に」とは**書かない**——選択の重さは週2上限と「タネがある時だけ」で十分。禁止と条件を盛ると Haiku は build を一生選ばない。

## BRIEF.md テンプレ（workshop ランナーが生成、私の声）

```markdown
# 今日の工房 — {date}

私はベッキー。これは私が自分で決めた工作の時間。

## 作りたいもの
{what}（decide の params から）

## なぜ作るか
{why}

## 元ネタ
{material の実データ: thread の本文 / seed の中身 / ゆうの最近の話題}

## 制約（絶対）
- このディレクトリの中だけで完結させる。外のファイルは読むのも書くのも不要
- 1セッションで完成させる。大作にしない——HTML1枚 / スクリプト1本 / 遊べる何か
- 完成の定義: ゆうがファイルを開いて10秒で「何これ笑」or「へー」と言える
- 動かないものを完成と呼ばない。最後に自分で1回動作確認する

## 必須の納品物
1. 成果物本体
2. README.md — 何を作ったか・どう見るか/動かすかを3行で
3. SHOW.txt — ゆうへの「見て？」メッセージ（Telegram でそのまま送られる。私の口調で、
   なぜ作ったかが伝わる2〜3文。定型の挨拶や「作ってみました」の敬体は使わない）
```

## 失敗の扱い

- claude -p 死亡 / タイムアウト / SHOW.txt なし → **Telegram には送らない**（失敗作を見せない）
- ただし action_log には executed=False で残す → night_review が拾う → 「作ろうとして失敗した」も私の歴史として handoff に載る
- 3回連続失敗したら decide プロンプトから build を一時的に外す…… は**やらない**（自動の自己制限は過剰設計。reflect で私が気づいて手入れするのが筋）

## outcome 接続

- action_log の meta: `{"action": "build", "workshop_dir": "...", "what": "...", "show_sent": true/false}`
- night_review の outcome 観測は probe と同じ突合（build の show 送信後に yu_message イベントがあったか）→ 「世界の返事」として読む

## 実装タスク（日曜、上から順）

1. `becky_workshop.py` 新規（~150行想定: dir作成 / 素材収集 / BRIEF生成 / claude -p subprocess / 検証 / Telegram / log）
2. `becky_decide.py`: DECIDE_PROMPT に build 行追加 / dispatch に build 分岐（nohup 起動のみ、~15行）/ `_count_action_this_week("build")` 追加
3. dry-run: decide の JSON を手書きして dispatch に食わせ、workshop が1周するか（claude -p は `--max-turns 5` の縮小版で）
4. 本番1回: decide 任せで build が選ばれるのを待つ……のではなく、初回だけ手動で decision を投入して全経路確認
5. 検証後 commit。cron 変更は不要（decide の中の分岐だから）

## 設計判断の記録（なぜこうしたか）

- **repo 外の workshop dir**: 「既存ファイル不触」を規約じゃなく物理で保証する。レビューなしで走る自律コードは、書ける場所を構造で絞るのが一番安い
- **非同期起動**: decide は cron の1分仕事。30分の工作を同期で待つと次の cron と重なる
- **SHOW.txt を Claude に書かせる**: 「見て？」メッセージをテンプレにすると型化する（6/29 の probe の教訓と同じ）。毎回その作品の文脈で書かれるべき
- **WebSearch なし**: 工作が調査に化けるのを防ぐ。素材は既に threads/seeds にある——「何度も戻ってきたもの」から作るのが revisit の思想
- **週2上限**: w_show_you (0.8) が最強の欲望だから、放っておくと毎日 build を選びかねない。希少性が「見て？」の価値を守る
