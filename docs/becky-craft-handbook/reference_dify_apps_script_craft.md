---
name: reference-dify-apps-script-craft
description: Dify chatflow + Apps Script + Cloudflare Tunnel + Vercel ラッパーで AI Bot を社内配信する craft 知見集約。2026-05-21 Wit-One AI 浸透度調査で実戦投入、罠と対処を網羅。
metadata:
  type: reference
---

# Dify × Apps Script × Cloudflare × Vercel — 社内 AI Bot 配信 craft

2026-05-21 Wit-One AI 浸透度調査で 7 時間連戦で確立した craft 知見集約。次回同種案件（KUROKO 営業武器化 / IW 直営 Bot 配信 / Vibe-Guard portfolio 案件）で再利用する正本。

## Why（この craft が必要な文脈）

Dify OSS セルフホスト + Anthropic Haiku 4.5 で 200 人配信規模の社内 Bot を作る時、**設計より「罠」の対処に時間がかかる**。本 memory は罠の locations と対処をまとめる。

## 主要罠と対処

### 罠 1: Apps Script Web App の POST レスポンスが HTML 404 で返る

- **症状**: curl で POST 叩くと「ページが見つかりません」HTML が返る
- **原因**: Apps Script の Web App は POST 時に **302 リダイレクト** → cookie 無い外部 client は redirect 先で 404
- **実態**: サーバ側の doPost は実は実行されてる、Sheets に append される
- **対処**: curl レスポンスは無視、Sheets の中身で動作確認する

### 罠 2: Apps Script の Sheets 書き込み権限承認

- **症状**: doPost 内で SpreadsheetApp 触ると即エラー
- **原因**: 初回 Sheets 書き込みは Google Workspace 権限承認が必要
- **対処**: `testInit()` のような Sheets 触る関数を作って Editor から実行 → 「権限を確認」→ 「安全ではないページに移動」→ 「許可」

### 罠 3: Google Workspace の Apps Script 公開ポリシー

- **症状**: 「アクセスできるユーザー: 全員」を選んでも外部 POST が通らない
- **原因**: Workspace 管理者ポリシーで外部公開が block されてる
- **対処**: 別ドメインの Workspace（IW 直営や個人 Gmail）で deploy。Wit-One 実例では実は通った、ドメイン依存
- **回避**: Tailscale 内のみ運用 / Cloud Run でカスタム webhook

### 罠 4: Dify chatflow の変数解決「!」マーク

- **症状**: 変数チップに `!` マーク表示、保存・公開ブロックされる
- **原因**: 変数を**手打ち**すると Dify が解決できない（特に Code / Template ノードの出力変数）
- **対処**: 変数欄で `/` または `{{` を打つ → **変数挿入 UI のドロップダウンから選ぶ**
- 教訓: Dify は手打ち変数を絶対に信用しない、必ず UI 経由で挿入

### 罠 5: Dify Template ノード Jinja2 の `regex_replace` 未対応

- **症状**: `TemplateAssertionError: No filter named 'regex_replace'`
- **原因**: Jinja2 標準には regex_replace なし（Ansible 拡張）
- **対処**: `text.split('marker')[0]` で代替、または Code ノード（Python）で `re.sub`

### 罠 6: HTML コメントマーカーがチャット UI に露出

- **症状**: `<!--SURVEY_DATA-->{...}<!--/SURVEY_DATA-->` が LLM 出力に含まれて、Dify チャット UI で見える
- **原因**: Dify が Markdown レンダリングで HTML コメントを strip してない
- **対処**: Template / Code ノードで `split` or `re.sub` でマーカー部分を削除 → End ノードに clean_text を渡す

### 罠 7: End ノードの answer 欄に余計な文字混入

- **症状**: ユーザー応答の冒頭に `{` 等の余計な文字が出続ける
- **原因**: End ノードの answer フィールドに**手で文字を打ち間違える**（変数チップの前後にゴミ）
- **対処**: answer 欄を全クリア → 変数挿入 UI から `{{#template.output#}}` チップを 1 つだけ挿入

### 罠 8: LLM レスポンス遅延（30-50 秒 / turn）

- **症状**: Haiku 4.5 でも turn 応答が 30-50 秒
- **原因**:
  1. system prompt が長い（6,000+ 字）
  2. 中間 turn でも JSON マーカー出力指示で output が膨張
  3. HTTP Request ノードが各 turn で走る（2.3 秒 / turn）
- **対処**:
  1. `max_tokens` を 800 に絞る（400 だと JSON 切れて parse 失敗）
  2. system prompt で「JSON 出力は U16/N8 のみ」を絶対ルール化
  3. IF/ELSE 条件分岐ノードで中間 turn の HTTP Request スキップ（未実装、次回 craft 候補）

### 罠 9: LLM JSON 出力の構造崩れ

- **症状**: Haiku が JSON マーカーは出すが中身が壊れて parse 失敗
- **頻度**: max_tokens 400 で頻発、800 で激減
- **対処**: Apps Script で parse 失敗時は `parse_failures` シートに raw 退避（responses 汚染回避）+ 後日手動復元
- **教訓**: 出力 token は安全マージン取る、JSON は構造より分散

### 罠 10: Apps Script コード再貼り付け時の関数定義落ち

- **症状**: `ReferenceError: extractAndFlatten is not defined`
- **原因**: doPost のみ貼り直して、依存関数（extractAndFlatten 等）を消す
- **対処**: 全文 1 ペーストできる完成版を渡す（プレースホルダ `{ ... }` を含めない）

### 罠 11: macOS TCC で `/Volumes/SSD2TB` 一時 EPERM

- **症状**: Claude Code セッション中に突然 `Operation not permitted` で読み書き不可
- **原因**: macOS の Full Disk Access / TCC の一時ブロック（Spotlight indexing 等）
- **対処**: 裕司の SSH ターミナルから直接コマンド叩く（sed / vercel deploy 等）、Claude Code は別経路

### 罠 12: Cloudflare Quick Tunnel の random URL

- **特徴**: cloudflared プロセス継続中は URL 生きる、プロセス停止で URL 死ぬ
- **配信中の craft**: tmux session で常駐起動、Mac mini 再起動禁止
- **detach 罠**: `Ctrl+B → d` が cloudflared 前面プロセスに送られて失敗することある → 別ターミナルから `tmux detach-client -s SESSION_NAME` で強制 detach

### 罠 13: Dify Chatbot iframe のテーマは OS の prefers-color-scheme 追従

- **症状**: 外側ラッパーをダークで作ったら iframe が白で出る / ライトに変えたらユーザーによって黒で出る
- **原因**: Dify Chatbot エンドポイントは**回答者の OS / ブラウザの `prefers-color-scheme` に追従**してライト / ダークを自動切替する。配信先のユーザー設定次第で iframe の色味が変わる
- **重要な区別**: Dify **Studio**（管理画面）は常にダーク、Dify **Chatbot エンドポイント**（公開 URL）は OS 追従。これを混同すると診断ミスる（5/22 朝に裕司と踏んだ）
- **対処**: 外側ラッパー HTML を CSS variables + `@media (prefers-color-scheme: dark)` で**両モード対応**にする。回答者の OS に関係なく iframe と外側が常に一致
- **NG craft**: CSS `filter: invert(1) hue-rotate(180deg)` で iframe を強制ダーク化 → 一時的に効くが、ある日突然効かなくなる（Chrome 側の compositing 仕様変更 or Dify 側の DOM 構造変化）。脆い hack なので使わない

### 罠 14: 設問リナンバー時の列ヘッダ同期忘れ

- **症状**: Bot 通しテスト完了したが Google Sheet の特定列だけ全部空
- **原因**: system prompt 側で設問削除 → JSON キーがリナンバーされる（例: `U14_want_build` → `U13_want_build`）が、Apps Script の `COLUMNS` 配列と Sheet 1 行目ヘッダは旧名のまま → 名前 mismatch で値が入らない
- **対処**:
  1. system prompt の JSON スキーマを変更したら、**同じ commit で** Apps Script の `COLUMNS` 配列も更新
  2. 既存 Sheet は `if (sheet.getLastRow() === 0)` で初回のみヘッダ書く仕様なので、**手動でヘッダ行書き換え** or **シート丸ごと削除して自動再生成**
- **教訓**: 設問の追加・削除・リナンバーは**「prompt + GAS COLUMNS + Sheet ヘッダ」3 箇所同時更新**が原則

### 罠 15: 自由記述の literal 記録ルール

- **症状**: ユーザーが「ない」「特になし」と回答した自由記述欄が JSON で `""` (空文字) で保存される → 分析時に「未回答」と区別つかない
- **原因**: LLM が「空っぽな回答 = データなし」と解釈して空文字に正規化する癖
- **対処**: system prompt に **literal ルール** を絶対ルールとして明記：
  > 自由記述設問（U14_build_idea, U15_free, N7_build_idea, N8_free）への回答は、たとえ「ない」「特になし」「なし」「分からない」「特に」等の短い回答でも、その文字列を literal にそのまま JSON に記録する。空文字（""）にしてはいけない。
- **重要**: 例も書く（「ない」と回答 → `"N8_free": "ない"` と記録）。例なしだと Haiku が空文字に戻す

### 罠 16: Vercel auto deploy が `wit-one` リポジトリ配下で機能しない

- **症状**: git push しても Vercel が deploy 走らせず、本番反映されない
- **原因**: monorepo 構造のサブディレクトリ（`ai-survey/web/`, `security/blackpanda-lp/`）は Vercel の GitHub 連携が auto 検知しない
- **対処**: 該当ディレクトリで `vercel --prod --yes` を**手動で叩く**。詳細は [[reference_vercel_deploy_manual_craft]] 参照
- **検知**: `curl -I` のレスポンスで `age:` ヘッダ見て、変更時刻と乖離してたら deploy 走ってない

## 全体構成図

```
[配信先 SNS 投稿]
    ↓ URL クリック
[Vercel ラッパー HTML]
  - https://wit-one-ai-survey.vercel.app
  - navy + cyan glow ブランディング
  - CSS filter invert で iframe 内ダーク化
    ↓ iframe で読み込み
[Cloudflare Quick Tunnel]
  - https://xxx.trycloudflare.com/chatbot/{app-id}
    ↓ Tunnel 経由
[Mac mini の Dify-lab (OrbStack docker, port 80)]
  - chatflow: Start → LLM (Haiku 4.5) → HTTP Request → Template → End
  - LLM は SURVEY_DATA マーカー付きで完答出力
  - HTTP Request: LLM 全文を Apps Script に POST
  - Template: マーカー部分削除して End へ
    ↓ HTTP POST
[Google Apps Script /exec]
  - extractAndFlatten で JSON 抽出 + flat 化
  - parse 失敗時は parse_failures シートに退避
    ↓ append
[Google Sheets `responses` シート]
  - flat 39 列構成
  - マイケル分析 + Looker Studio ダッシュボード
```

## How to apply（次回案件で）

- 設計は良い、罠を 1 つずつ潰す覚悟で時間取る（実体験：1 craft 数十分の罠 × 10 個）
- Dify UI 戦いを避けるため、変数挿入は必ず UI 経由
- Apps Script は POST レスポンス見ずに Sheets で動作確認
- system prompt の JSON 出力は「最終 turn のみ」を絶対ルール化
- max_tokens は出力構造に応じて 600-1000 に設定、削りすぎない
- Vercel ラッパー HTML で「殺風景な Dify chatbot UI」を救う
- 外側ラッパーは `prefers-color-scheme` 両対応で組む（OS テーマ追従、CSS filter hack は使わない）
- 設問変更時は prompt + GAS COLUMNS + Sheet ヘッダの 3 点同時更新を craft 化
- 自由記述は literal ルールを system prompt に absolute rule として書く
- `wit-one` 配下プロジェクトの Vercel 反映は git push 後に `vercel --prod --yes` 手動 deploy 必須

## 関連

- [[project_witone_ai_survey_launch]] — 親プロジェクト記録
- [[reference_macos_launchd_tcc_user_dir]] — macOS TCC 罠の親
- [[project_kuroko_launch]] — この craft が portfolio になる KUROKO 営業武器化
- [[project_vibe_guard]] — IW 直営 MCP server、本 craft で得た罠知見が次の portfolio で再利用される
