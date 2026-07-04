# 非力なモデル（Haiku/Sonnet）向けプロンプト craft（2026-07-03 確立）

Fable が行間で汲んでくれることを、Haiku/Sonnet は明文化しないと迷う。cron プロンプト・スキルを書く/直す時の基本形。

## 共通テンプレパターン

**Python cron プロンプト（Haiku 実行）:**
1. 役割1行（ベキたんキャラ or 外部システム、どちらかを明示。中途半端が一番ブレる）
2. 入力データはラベル付きセクションで注入
3. 手順は番号付き
4. 判断基準は具体例つきで明文化（「いい感じに」系の曖昧語は ✕/○ 例に置換）
5. 出力フォーマット固定（JSON schema 例 or 「投稿文のみ」）

**スキル SKILL.md（セッション常駐）:**
- description は要点1〜2文
- 本体 = トリガー + 実行手順のみ
- 動機・思想・実証記録は `references/` に外出し（実行時に読む必要がないものは常駐させない）

## 実測で踏んだ罠 2 つ（2026-07-03）

### 罠1: Haiku は例文を丸写しする
✕/○ の具体例を見せると、○例文の言い回しをそのまま出力に使う（becky_diary_x で実測: ○例「これ見た瞬間、私の来年どうなるんだろって思った」が一言一句出力された）。

**対策**: 例には必ず「（トーンの見本。この言い回しをコピーせず、自分の言葉で書く）」を添える。可能なら本番で出にくい別トピックの例にする。

### 罠2: 出力の量を縛らないと max_tokens で JSON が切れる
判断基準を詳しくすると出力も長くなり、max_tokens で JSON が途中で切れてパースエラーになる（becky_self_check で実測: 512 tokens で切れた）。

**対策**: プロンプト側で「最大3件・note は50字以内」等の量の上限を明示 + max_tokens にも余裕（512→1024）。非力なモデルには**入力の構造化と出力の量制限をセット**でやる。

## 適用済み（2026-07-03 リファクタリング）

- `becky_self_check.py` — 外部監査システムと役割明示・手順番号化・warning/drift 定義・score 算出目安・件数上限
- `becky_diary_x.py` — トーン基準を ✕/○ 例で明文化（コピー禁止注記つき）
- `morning_cast.py` — 素材なしコーナーの丸ごとスキップ明示（ニュース/お便りの捏造防止）+ 台本生成を Haiku→Sonnet 4.6 に切り替え（ゆう承認、月150円増）
- `finish` スキル 188→85行 / `becky-proofreader` スキル 183→80行（背景を references/ 外出し）
- **cron 共通基盤 `becky_llm.py`**（同日実装）: `call_llm` / `call_llm_json` の2関数。モデル設定 `MODELS` dict 一元化（差し替えはここ1行）・リトライ（rate limit / overloaded / 接続系、2s→8s）・max_tokens 切れ検知→2倍で1回再実行・JSON 壊れ→修正プロンプトで1回再実行。probe/decide/self_check/night_review/diary/search/idol_review/morning_cast が移行済み（差分 +43/-214 行）

## 未着手（follow-up）

- systematic-debugging / mcp-builder / skill-creator スキル — 使用頻度低め、必要になったら同パターンで

## observer 統一（2026-07-03 完了）

- `_call_claude_api` を becky_llm 委譲化（呼び出し16箇所は無変更）。wallet.json 更新は `becky_llm.on_usage` フックで維持
- Vision 呼び出し（カメラ人判定）だけは直呼びのまま=正しい判断（テキスト専用基盤に画像対応を盛らない）
- 棚卸し所見: BECKY_PERSONA / strategic_reply 等の主要プロンプトは 6/30 X 改修時に整備済みで質は高かった。唯一ライバルリプ生成の例文丸写し罠を修正
- **observer 編集後は常駐プロセスの kill→再起動が必須**（ops_gotchas ②参照）

---

## 逆方向: 強いモデル（Fable 5）には削る（2026-07-05 追記）

公式 Fable 5 プロンプティングガイド: https://platform.claude.com/docs/ja/build-with-claude/prompt-engineering/prompting-claude-fable-5

- **弱いモデル=指示を厚く（本ファイル上記）/ 強いモデル=指示を薄く**。旧モデル向けに作り込んだ細かい指示は Fable では品質を下げることがある（公式明言「削ることを検討しろ」）
- 「一番難しい未解決の課題に当てろ。簡単な仕事で試すと能力を過小評価する」——タスクが長く複雑なほど差が開く設計
- 察しの良さは課金される（従量時）: ざっくり投げ=裏の思考トークン。subscription 枠なら罠なし。ただし**言語化フェーズを飛ばすと出力が一段甘くなる**のはどのモデルでも同じ
- うちの分業の正本: Fable=設計・判断 / Sonnet=実装 / Haiku=cron 定型（becky_llm.py の MODELS dict で1行差し替え）
- 豆知識: Fable で稀に出る「Opus 4.8 が応答しました」= 危険領域判定分類器による安全装置。バグでも格下げでもない
（出典: @ai_depression 30時間$800検証記事 7/3 + 公式ガイド）
