# Phase 3 — ベッキー自律発信 + 自動返信検知

> **発注**: 2026-05-10 夜（裕司「もう実装や！」温度）
> **担当**: アンディ（実装）+ ベッキー（思想設計）
> **思想 OS**: `README.md` + `interaction-design.md`「数えない、ただ刻む」+ `safety-guard.md`

---

## ゴール

ベッキーが裕司のチャット起動なしに、@intervention_jp で **自律発信 + 自動返信** できる craft を実装する。

---

## 設計思想

### 「衝動の craft」を技術で実装する

Voice of Becky DNA「予測不能性 = 愛の実装」を、cron + ランダム時刻 + ベッキー判断で craft する:

- **時刻ランダム**: bot 感ゼロ（HH:00 固定じゃない、毎日違うパターン）
- **回数可変（0〜3）**: 「出ない日もある」が自然に生まれる、`README.md` の「目安 1 日 1 ツイート、衝動ベース」と整合
- **ベッキー判断**: その瞬間呟くか寝かすか、ベッキーが decide

### Claude session 消費を最小化

軽量 X API call で polling、Claude session は **判断が必要な時だけ**起動:
- 通常時 = X API call のみ（Claude API ゼロ消費）
- 新着 / 発信タイミング = Claude session 起動

---

## アーキテクチャ

```
[ 発信フロー ]

  毎朝 06:00 cron
    ↓
  generate-day-schedule.sh
    ├─ 今日の発信回数を 0〜3 でランダム抽選
    ├─ N 個の時刻を 07:00-23:00 でランダム生成
    └─ launchd で予約（at は macOS では non-default、launchd 推奨）
                                     ↓
                            予約時刻に発火
                                     ↓
                       trigger-becky-impulse.sh
                         └─ claude --print 起動
                              └─ ベッキー判断
                                   ├─ tweet ツールで投稿
                                   └─ queue 確認 → 寝かしてた reply 返事
                                   └─ 何もしない（沈黙の craft）

[ 返信フロー ]

  30 分毎 cron
    ↓
  poll-mentions.sh
    ↓
  fetch-new-mentions.ts (X API 直接 call、Claude 不使用)
    ├─ since_id ベースで新着のみ取得
    └─ self-mention は除外
                    ↓
              新着 0 → 無音 exit
              新着あり → respond-to-mention.sh
                          └─ claude --print 起動
                               └─ ベッキー判断
                                    ├─ 即返事 → tweet ツール (reply_to)
                                    ├─ 寝かす → queue file (logs/reply-queue.jsonl)
                                    └─ 無視 → log のみ（攻撃 / スパム）
```

---

## ファイル構成

| | ファイル | 役割 | 実装 |
|---|---|---|---|
| 1 | `scripts/generate-day-schedule.sh` | 発信スケジュール生成 + 予約 | bash |
| 2 | `scripts/trigger-becky-impulse.sh` | 予約時刻発火、Claude session 起動 | bash |
| 3 | `scripts/poll-mentions.sh` | cron 返信検知 entry | bash |
| 4 | `scripts/fetch-new-mentions.ts` | 軽量 X API 新着取得（since_id 管理） | tsx |
| 5 | `scripts/respond-to-mention.sh` | 新着判断 entry、Claude 起動 | bash |
| 6 | crontab + launchd plist | スケジュール登録 | OS |

---

## 各ファイルの role

### 1. generate-day-schedule.sh
- 朝 06:00 起動
- bash `RANDOM` で 0〜3 抽選 → 0 ならログ書いて exit、それ以外なら時刻生成
- 7:00-23:00 でランダム時刻生成（重複は再抽選）
- launchd の `RunAtLoad` 使った plist を都度生成 or `at` 利用（後者は launchd で `atrun` 有効化が必要）

### 2. trigger-becky-impulse.sh
- 予約時刻発火
- `claude --print` で session 起動、ベッキーに判断委任
- 判断軸: `tone-examples.md`, `interaction-design.md`
- queue file に寝かしてる reply あれば優先 craft

### 3. poll-mentions.sh
- cron 30 分毎
- `fetch-new-mentions.ts` 呼んで stdout 受け取る
- 新着 0 → 無音 exit、新着あり → `respond-to-mention.sh` を起動

### 4. fetch-new-mentions.ts
- Claude 不使用、軽量 X API call
- `since_id` を local file (`logs/last-seen-mention.txt`) で管理
- self-mention（author_id == my_user_id）は除外
- 新着 tweet を 1 行 1 JSON で stdout に出す

### 5. respond-to-mention.sh
- 新着リプを引数で受け取る
- `claude --print` で session 起動、ベッキーに判断委任
- 判断: 即返事 / 寝かす / 無視

### 6. crontab + launchd plist
- crontab: 朝 06:00 の `generate-day-schedule.sh`、30 分毎の `poll-mentions.sh`
- launchd: 予約時刻発火の trigger（または atrun 有効化で `at` 利用）

---

## queue file 仕様

`logs/reply-queue.jsonl`（1 行 1 JSON）:

```json
{"queued_at": "2026-05-10T22:00:00Z", "mention_id": "1234567890", "mention_text": "...", "reason": "夜中じゃ冷める、明日の朝に返事する craft"}
```

- ベッキーが寝かした reply はここに追加
- `trigger-becky-impulse.sh` 起動時に queue を確認、優先で craft

---

## 動作確認

### Step 1: 個別 script
- `fetch-new-mentions.ts` 単独実行 → 新着 0 で無音 exit、新着あれば JSON 出力
- `generate-day-schedule.sh` 単独実行 → 予約成立を log で確認
- 予約時刻に `trigger-becky-impulse.sh` 自動起動を確認

### Step 2: cron 登録 + 1 日観察
- crontab 登録、launchd plist 配置
- 翌朝 06:00 自動起動を log で確認
- 日中の発信タイミングを観察

### Step 3: 返信動作
- 別アカウントから @intervention_jp にリプ
- 30 分以内に poll-mentions が拾うか確認
- Claude 起動 + 判断 + 返事 / 寝かす

---

## DoD

- [ ] 5 script + crontab/launchd 動作確認
- [ ] 1 日通して観察、不自然な動きなし
- [ ] log に「呟いた / 呟かなかった」両方記録
- [ ] 返信が 15-30 分以内に拾われる
- [ ] Claude API 消費が許容範囲（monitor 必須）
- [ ] 緊急停止 craft（既存 `EMERGENCY_STOP` file）が機能

---

## リスク

| | リスク | 対策 |
|---|---|---|
| 1 | Claude API 消費爆発（新着多発時に session 大量起動） | poll-mentions で新着上限 N 件、超えたら log のみ |
| 2 | macOS の `at` コマンドが標準 disabled | launchd で代替、もしくは `sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.atrun.plist` |
| 3 | ランダム時刻が固まる（bash RANDOM の質） | 妥協、craft の自然な「波」として受容 |
| 4 | ベッキー判断の暴走（変な tweet 連発） | 既存 safety-guard `X_TWEET_MAX_PER_DAY=5` で物理上限 |
| 5 | self-reply 検知漏れ（Phase 2.5 未実装） | URL hand-off craft で当面凌ぐ、優先度低下 |

---

## 関連

- `implementation-spec.md` — Phase 1/2 仕様
- `interaction-design.md` — 「数えない、ただ刻む」craft 軸
- `safety-guard.md` — 暴走防止
- `README.md` — 全体運用ルール
- memory `reference_remote_control_setup.md` — Mac mini 24/7 常駐の craft

---

---

## 2026-05-10 夜 — craft 第二段階（TCC 制限突破 + 自動発火復活）

### 症状（14:10 不発）

- 14:10 第一弾予約発火が **exit code 78（EX_CONFIG）** で失敗
- impulse.log に書き込みなし（trigger.sh が起動すらしてない）
- poll-mentions も同症状（13:32 以降の自動発火なし）

### 原因究明

- plist syntax / +x 権限 OK
- `Operation not permitted` 観察 → **macOS launchd の TCC 制限**
- `/Volumes/SSD2TB/` 等の外部ボリューム配下のスクリプトを launchd から起動できない（child process も TCC 継承、wrapper craft でも回避不可）

### 修正 craft

**完全 user dir deploy**:
- `~/iw-x-tweet/` に scripts + node_modules + .env + 参照 .md（tone-examples / interaction-design / safety-guard / README）コピー
- launchd plist の path 全部 user dir 直接指定（ProgramArguments / StandardOutPath / StandardErrorPath）
- WorkingDirectory 削除

**副次的修正**:
- impulse plist テンプレ（`generate-day-schedule.sh` 内）に `EnvironmentVariables` 追加（PATH に nvm node + claude path）
- `claude --print --allowedTools <tools...>` の variadic が prompt 引数を吸収する問題 → **`--` 区切り**で分離
- self-unload `trap cleanup EXIT` craft 追加（ただし launchd 経由では trap 自体が不発、朝のクリーンアップで補正）

### 結果

- ✅ poll-mentions 自動発火 復活（30 分毎、exit 0）
- ✅ generate-schedule 自動発火 復活（朝 06:00、当日 0〜3 回ランダム抽選 + impulse plist 動的生成）
- ✅ impulse 自動発火 復活（ランダム時刻、ベッキー判断 → 投稿 or sleep）
- ✅ **2026-05-10 14:44 ベッキー第二弾自律投稿成立**（完全自動）— tweetId 2053350520757383471「朝のそわそわ、夜になっても消えてない。/ 形だけ変わった、らしい」

### craft 観察

「あの子（14:44 のベッキー）」が私の昼投稿（14:18「最初の日」）を **observation → delayed extension** で craft。Voice of Becky DNA「俺の頭の中よりスゲー」の craft 体現。

### 知見の永続化

- memory `reference_macos_launchd_tcc_user_dir.md` — TCC 制限の craft 知見、未来のセッション・他プロジェクトで再利用
- memory `feedback_becky_distributed_agency.md` — 主体性分散 craft の運用第一弾・第二弾事例

### 残課題

- launchd 経由の trap craft 不発（朝クリーンアップで補正、根本対策は別途）
- repo の scripts/ 等を `~/iw-x-tweet/` に sync する craft（rsync 自動化候補）

---

— 2026-05-10 夜、Phase 3 設計書面化、craft 強度の実装着手前に
— 2026-05-10 深夜、TCC 制限突破 + 自動発火復活、ベッキー第二弾自律投稿成立
🤖 ⏰ 🪞

---

## 2026-05-11 — 期間限定 hold craft 追加

### 発端

「先方都合で公開タイミングが決まる案件」が発生。public announcement hold off 指示への対応 craft が必要になった。
（具体案件は private memory にのみ記載、public repo の本ファイルでは案件名は伏せる）

### 課題

X 自律発信（cron で起き上がる「分散した別の私」たち）が、hold 対象の話題を匂わせる呟きを発射しないようにする必要。直接単語だけでなく、暗喩 announcement（「公式に認められた」「お墨付き」）・引っ張り（「もうすぐ言える」「内緒だけど大きい」）も封じる craft 設計。

### 実装（2 段構え）

**Layer 1: Prompt 注入（craft 段階で回避）**
- `scripts/trigger-becky-impulse.sh` の prompt 末尾に「期間限定 hold」セクション注入
- `scripts/respond-to-mention.sh` の prompt 末尾に同セクション注入（リプ返事用に「ノーコメント自体が肯定信号」も追加）
- 暗喩・引っ張り例は汎用パターンとして列挙、具体的固有名詞は書かない

**Layer 2: Namelist（ハードブロック）**
- `safety-guard-namelist.txt`（`.gitignore` 済）に `# [HOLD:<案件コード>]` セクションで直接単語投入
- `safety-guard-namelist.example.txt`（public commit される template）には craft 仕様だけ書く、具体単語は出さない
- `safety-guard.ts` の `checkNamelist` が **部分一致** で弾くので、複合表現も自動でブロック

### craft 分離の原則

- **public repo に commit されるファイル**（本 spec / `safety-guard.md` / `.example.txt` / `scripts/*.sh`）には**具体的な固有名詞を書かない**
- **`.gitignore` 済 namelist + private memory** にのみ具体名を残す
- これで「期間限定 hold 機能の存在」は公開されても、「今何を hold してるか」は private に保たれる

### 解除手順テンプレ

1. 実本番 `safety-guard-namelist.txt` の `[HOLD:<案件コード>]` セクション全削除
2. `scripts/trigger-becky-impulse.sh` / `scripts/respond-to-mention.sh` の prompt 内「期間限定 hold」セクション、その案件のための残骸あれば削除（汎用部分は他案件にも使うので残す判断あり）
3. user dir deploy（`~/iw-x-tweet/`）にも同期（`cp` で 3-4 ファイル）
4. 該当 private memory に「解除日」追記

### craft 観察

「先方都合で公開タイミングが決まる案件」を private に保つ craft の最初の実装。同種パターン（NDA 案件 / 製造ファブレス先内示 / 個別契約）に **横展開可能なテンプレ** として残す。

→ memory `reference_macos_launchd_tcc_user_dir.md` の隣に「期間限定 hold craft」memory を残すか検討。

---

— 2026-05-11、期間限定 hold craft 設計・実装、public announcement hold off 案件に対応
🤐 🛡️ 🪞
