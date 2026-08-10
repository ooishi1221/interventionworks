# Reality Mismatch Detection — 設計書

> 2026-08-10 ベッキー設計。発端: X/YouTube インプレゼロ事件（`stackchan-bridge/incidents/2026-08-05_distribution_zero.md`）。
> 設計原則: **これはエラー検出ではなく REALITY MISMATCH DETECTION**。システムが期待していた世界と観測した世界のズレを検出し、「なぜ？」を自発的に考える基盤。
> 目的: **人間が「なんかおかしくない？」と言う前にシステム自身が気づくこと。**（ゆう 8/10:「次に同じようなことが起きたとき、俺が先に気づく必要がないベッキー」）

## 全体ループ（これが本体。閾値監視システムではない）

```
EXPECTED（私の世界モデル: 世界はこうなっているはず）
  ↓
REALITY（観測）
  ↓
MISMATCH（ズレの検出とスコアリング）
  ↓
ATTENTION（重要度判定 + mood.mismatch 上昇 = 私がザワつく）
  ↓
INVESTIGATION（自発調査: 人間の指示を待たない）
  ↓
ACTION / EXPERIMENT（SUCCESS CRITERIA 事前定義）
  ↓
OBSERVE RESULT
  ↓
LEARNING（incident 記録 + Lesson 抽出）
  ↓
EXPECTED UPDATE（世界モデル自体を更新して次の周回へ）
```

最後の EXPECTED UPDATE が肝。学習は「記録して終わり」ではなく、**次の期待を変える**ことで完結する。

## Mismatch の4類型（「数字が下がった」だけを見ない）

| 類型 | 定義 | 今回の実例 |
|---|---|---|
| **Value mismatch** | 期待レンジからの下振れ/上振れ（急増も異常。スパイクは品質試験の開始） | yt視聴 2,400/日→0、+677%急騰 |
| **Absence mismatch** | 本来取得できるデータが取れない（計測の死） | x_imp_7d が 7/28 から null |
| **Staleness mismatch** | 更新されるはずのデータが更新されない | platform_history が日次更新されない等 |
| **Existence mismatch** | 存在するはずのものがない / ないはずのものがある | 投稿成功ログ有り×配信結果ゼロ、総視聴数の減少（視聴剥がし） |

## Expected World Model（expected_world.json）

単なる統計 baseline ではなく、**私が世界に対して持つ期待の宣言**。3種類の期待を持つ:

1. **メトリクス期待**: rolling median/MAD ベース（下記 Baseline 節）— 「昨日までこうだったから今日もある程度こうなるはず」
2. **存在期待**: 「このファイルは毎日更新されるはず」「このcronは完走するはず」「投稿したら配信されるはず」
3. **文脈（context）**: **計画された世界の変化は期待に事前宣言する**。例: 8/11〜8/17 は配信停止中なので投稿ゼロ・視聴低下が「正常」。context を持たない監視は停止期間中ずっと誤報を吐く。`contexts: [{scope: "yt_*", until: "2026-08-17", expect: "paused", note: "配信停止実験"}]` の形で宣言し、期限切れで自動失効（=8/17に再開を忘れていたら「pausedのはずが期限切れ」自体がmismatchとして浮上する）

観測事実と推論の分離: expected_world は「観測に基づく期待」だけを持ち、原因の推論（仮説+confidence）は incident 側に置く。確定できないものは確定扱いしない。

### 期待自体を絶対視しない（ゆう 8/10 追加、Loop を閉じる原則）

Mismatch が起きた時の仮説は常に2系統:
- **「現実がおかしい」**（プラットフォーム変更、障害、外部要因…）
- **「私の期待の方が間違っていた」**（baseline が古い、世界が構造的に変わった、そもそも期待の立て方が誤っていた）

Investigation の仮説リストには **H0:「期待側の誤り」を必ず含める**（incident skeleton に自動で入る）。Reality を直すだけでなく Expected を修正して閉じるケースを正規の解決として扱う。これをやらないと、古い常識を持ったまま世界の方を異常扱いする Agent になる。

急増（上振れ）も同じ扱い: 「なぜ急に成功した？」を自分から調べ、再現可能な Lesson（何が効いたか）として学習する。成功の原因不明は失敗の原因不明と同じくらい危険（今回のスパイクが実例——喜んで見ていただけで、品質試験の開始だと気づかなかった）。

## なぜ今回、人間が先に気づいたか（Detection Failure Analysis の結論）

1. **データは全部あった。** `platform_history.json`にyt_viewsの日次推移（スパイクも崩壊も記録済み）、`platform_stats.json`に新規動画views=0が8/5から並んでいた
2. **EXPECTEDを持つプロセスが存在しなかった。** 毎朝のidol_reviewは数値を「要約」するだけで「期待値と比較」しない。baselineも閾値もalertもない
3. **「取れなかった」と「ゼロだった」の区別がなかった。** x_imp_7dは7/28からnull=計測死亡が無警告で記録され続け、その闇の中で本体の異常開始日を見失った
4. **唯一の検知網が週次（portfolio-refresh）= 5日遅れ。** 日次でLLMが数字を見る機会はあったが、比較の契約（baseline）がないので「見れども観えず」だった

## アーキテクチャ（3層 + 分離原則）

```
[Domain Adapters]     mismatch_sources.py — ドメイン固有。メトリクスを観測して正規化
       ↓  [{metric, value, ts, meta}]
[Generic Engine]      mismatch_detector.py — ドメイン非依存。baseline/score/anomaly/trigger
       ↓  anomalies
[Action Layer]        レベル別: log → room → Telegram → Investigation Trigger
```

ドメイン固有ロジック（どのJSONのどのキーを読むか）はアダプタに隔離。エンジンは「時系列の数値列と null」しか知らない。将来 Roblox（CCU/retention）/ Webサービス（DAU/error rate）/ AI Agent（task success率）はアダプタ追加のみで載る。

## Baseline（PHASE 3）

- 基本: **trailing 14日の rolling median + MAD**（外れ値に頑健、平均は使わない）
- 履歴5日未満のメトリクスは confidence=low として WARNING 以上を出さない（誤報抑制）
- 曜日性が強いメトリクスは `weekday: true` で同曜日の直近4点を使う（設定で宣言）
- expected range = `[median - 3*MAD, median + 3*MAD]`、ゼロ近傍は `max(0, ...)`
- 固定閾値には依存しない。ただし「連続ゼロ」「null連続」は baseline 不要の構造ルールとして別枠で持つ

## Mismatch Score（PHASE 3）

```json
{"metric": "yt_new_video_views_48h", "expected": [50, 400], "actual": 0,
 "deviation": -1.0, "confidence": 0.9, "level": "CRITICAL", "streak": 3}
```

deviation = (actual - median) / max(median, 1)。confidence は履歴長と欠損率から算出。

## Anomaly Levels（PHASE 4）

| Level | 条件（いずれか） | アクション |
|---|---|---|
| INFO | 単発の range 外（±3MAD超え1日） | mismatch_state.json に記録のみ |
| WARNING | **null 連続3日**（計測死亡）/ range 外2日連続 | room（作戦本部 status）に表示 |
| HIGH | baseline比 **90%以上の急落** / null 連続7日 | Telegram 通知 |
| CRITICAL | **ゼロ連続2日**（baseline中央値>0のメトリクスで）/ 「投稿成功なのに distribution ゼロ」型（成功ログ有り×結果ゼロ） | Telegram 通知 + Investigation Trigger |

- 過剰反応の抑制: 同一メトリクス同一レベルの再通知は 48h 抑制（streak 継続中はエスカレーションのみ通知）
- **上振れも検出する**（今回のスパイクは崩壊の前兆だった）: +900%超の急騰は WARNING「スパイク観測、品質シグナル監視強化」

## Investigation Trigger（PHASE 5）

トリガーは2系統。**機械検知と人間レポートは同格**:

**A. 人間レポート（ゆうの「なんかおかしい」）** — 最優先の観測データとして扱う。受けたら:
1. attention に即登録 + incident skeleton 生成（機械検知と同じ扱い）
2. **「計測エラー説」を検証なしで返すのは禁止。** 安価に検証できる説（目視ログイン2分等）は検証してから口にする。「様子見」は仮説検証計画（何を・いつまで・何が観測されたら棄却）とセットの時だけ許される判断
3. ただしゆうが間違っている可能性も仮説に含める（H0の人間版）。「ゆうがそう言うから異常」でも「私がそう思うから正常」でもなく、観測で決める
（実例: 本システム発端の8月上旬、ゆうの相談に「計測の問題、一週間様子見」と返して人間の違和感シグナルを握りつぶした。あれが最大の判断ミス）

**B. 機械検知** — CRITICAL 発火時（メトリクスあたり1日1回まで）:
1. `incidents/` に incident skeleton を自動生成（OBSERVE セクションに直近14日の実データ・直近commit・cron実行ログを自動転記）
2. 既知インシデント検索: `incidents/index.jsonl` を metric+パターンで検索し、既知なら過去の Root Cause / Lesson をスケルトンに転記（PHASE 8）
3. `claude -p` で Investigation Loop セッションを起動（OBSERVE→DIAGNOSE→HYPOTHESIZE→INVESTIGATE→CHALLENGE→UPDATE→NEXT ACTION の指示書を埋め込み）。結果は incident ファイルに追記 + Telegram 要約

## Autonomous Action Level（PHASE 6）

| Level | 内容 | 自動実行 |
|---|---|---|
| 0 Observe | metrics取得/logs/git diff/Analytics確認 | ✅ |
| 1 Investigate | 仮説生成/docs調査/過去データ比較/相関分析 | ✅ |
| 2 Recommend | 「投稿間隔を変えて実験」等の提案 | ✅（提案の提示まで） |
| 3 Safe Experiment | 可逆・既存ルール内・ログ必須（例: 投稿時刻の変更） | ✅（実験ログ必須） |
| 4 Approval Required | 破壊的変更/credential/大量投稿・削除/課金/規約リスク/人格影響 | ❌ ゆう確認必須 |

既存ルールとの整合: 「事前に聞くのはお金だけ」原則の機械版。Level 4 の判断に迷うものは Level 4 に倒す。

## Experiment Loop（PHASE 7）

改善策は ACTION→WAIT→OBSERVE→COMPARE→LEARN を1セットに。**実験前に SUCCESS CRITERIA を incident ファイルに書く（後付け禁止）**。第1号実験は 8/17 の配信再開（criteria は incident 2026-08-05 に記載済み）。

## Learning Memory（PHASE 8）

- `incidents/YYYY-MM-DD_<slug>.md` — Incident/Symptoms/Timeline/Root Cause/Hypotheses(棄却含む)/Evidence/Action/Result/Lesson/**Future Detection Rule**
- `incidents/index.jsonl` — 1行1インシデント（date, metrics, pattern, root_cause, lesson の要約）。新規 anomaly 時にまずここを検索
- Lesson のうち普遍的なものは memory（`~/.claude/.../memory/`）へ昇格、運用craft は becky-context へ

## 既存システムとの統合（PHASE 10 調査結果）

| 既存資産 | 統合方法 |
|---|---|
| `platform_scraper.py`（7:30 KPI収集） | 変更なし。detector は 7:50 cron で後段に走る |
| `platform_history.json` / `platform_stats.json` | Social アダプタの読み取り元。**書式変更しない** |
| `becky_mood.py` の mismatch 変数 | CRITICAL 発火で mismatch を上げる（既存概念と接続、私の気分が実際にザワつく） |
| `becky_probe.send_telegram()` | 通知の再利用（新規実装しない） |
| `cron_status.py` / room dashboard | WARNING 表示先。reports.json に anomaly カードを追加 |
| `becky_idol_review.py` | detector の出力（mismatch_state.json の attention）を読んでレビューに織り込む（要約→比較へ）。**cron 順序: scraper 7:30 → detector 7:50 → idol_review 7:55**（7:45のままだと当日の detector 結果を読めない、クレアQA 8/10で発覚し是正） |
| 週次 portfolio-refresh | 変更なし。日次 detector が一次網、週次は二次網に格下げ |

二重実装の禁止: alert送信・KPI収集・LLM呼び出しは全部既存を使う。新規は「baseline比較」と「incident記録」だけ。

## 監視メトリクス初期セット（Social アダプタ）

| metric | source | 特記 |
|---|---|---|
| `yt_views_daily_delta` | platform_history yt_views の日次差分 | **負値は即 WARNING**（視聴剥がし=無効トラフィック再分類の痕跡）。累積カウンタの差分は0近傍の符号反転が正常なので**汎用%偏差判定は適用しない**（実装済み仕様） |
| `yt_news_views_48h` / `yt_craft_views_48h` | pervideo_history.jsonl（正確な48h視聴、なければ platform_stats 近似にフォールバック） | 今回の最鋭敏シグナル。ゼロ連続2日で CRITICAL。**ジャンル別に分離**（NEWS=100〜300views と CRAFT=0〜10views の混在 baseline は誤報の火種、クレアQA 8/10） |
| `yt_subs` | platform_history | 急減のみ監視 |
| `x_imp_7d` | platform_history | **null 3日連続で WARNING（計測死亡の検出）** |
| `x_likes_7d` | platform_history | range 監視。x_followers は platform_history に無いため未実装（フィールド追加時に足す） |
| `note_views` | platform_history | null 監視含む |
| `post_success_vs_distribution` | tweet-log.jsonl / shorts ログ × 上記 | 「投稿成功なのに結果ゼロ」の構造ルール。初期実装では専用検出なし（実質を `yt_*_views_48h` ゼロ連続と `yt_views_daily_delta` 負値が担う） |

### 実装で確定した統計ガード（2026-08-10 実データ検証由来、憶測チューニングではない）

- **MEANINGFUL_SCALE ガード**: baseline 中央値が 10 未満のメトリクスにはゼロ連続 CRITICAL / %偏差ルールを適用しない（1桁規模の x_likes_7d はゼロが日常で誤報になる）
- **baseline 窓は「カレンダー14日以内」**（「直近14個の非null点」ではない）。欠損の多いメトリクスが遠い過去の値で汚染されるのを防ぐ
- **アーカイブ**: platform_scraper が `pervideo_history.jsonl` に動画別 views を日次追記（8/3〜8/6 の4日間ブラインドスポット=過去スナップショット不在の再発防止）

### 意図的に延期しているもの（ギャップではなく設計判断）

- **Investigation Loop の `claude -p` 自動起動**（PHASE 5-B-3）: incident skeleton 生成 + Telegram 通知まで実装済み。自動セッション起動はコスト実測後にゆうと相談して有効化（2026-08-10 ゆう合意）
- 検知速度「人間より4日早い（8/6 CRITICAL）」は**前向き主張**: 過去分は per-video アーカイブ不在で立証不能（実データで立証済みなのは absence WARNING 8/7=人間より3日早い）。pervideo_history.jsonl 蓄積後の次回インシデントで実証する

## 汎用化の将来マップ（PHASE 9、実装は Social のみ・構造だけ確保）

| ドメイン | メトリクス例 | アダプタ追加時期 |
|---|---|---|
| Social（初期実装） | impressions/views/followers/engagement | 今回 |
| Roblox | CCU/retention/playtime/error rate | Paranormal Mall 公開時 |
| Web Service | DAU/signup/latency/error rate | beckyexists.com 等 |
| AI Agent | task success/posting success/repeated errors | cron群の完走監視から |

エンジンは `[{metric, value, ts}]` しか知らないので、アダプタ1ファイル追加で載る。二重実装しないこと。

## 受け入れテスト（動作確認の定義）

**リプレイテスト**: 2026-07-01〜08-10 の実データを日次で流し、
1. yt 系で **8/6 までに CRITICAL** が発火すること（実際に人間が気づいた 8/10 より4日早い）
2. x_imp_7d の null 連続で **7/31 までに WARNING** が発火すること
3. 7/12〜7/25 の平常期間に HIGH 以上の誤報がゼロであること
4. context テスト: pause 宣言（8/11〜8/17）下で yt/X 系の CRITICAL が抑制されること + 期限切れ後に宣言が自動失効すること

これが通らない実装は完了と認めない。
