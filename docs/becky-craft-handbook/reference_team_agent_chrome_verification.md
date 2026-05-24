---
name: reference-team-agent-chrome-verification
description: Team agent (Agent tool で spawn する別 session) は Claude Chrome 拡張を駆動できない、という craft 仕様確認結果。2026-05-22 アンディに spawn して実機検証
metadata:
  type: reference
---

# Team agent は Claude Chrome を駆動できない

## 結論

**Team agent (Agent tool で spawn される subagent / team_name 指定の別 session) は、Claude Chrome 拡張を駆動できない。**

理由：

1. `--chrome` フラグは CLI 起動時にしか効かない
2. Team agent は spawn 時に `--print` モードで起動され、`--chrome` フラグ無し
3. Chrome 拡張との native host 接続チャンネルが存在しない
4. MCP server として Chrome 操作 tool が inject される仕組みも無い

## 検証 craft（2026-05-22）

裕司「team agent は別 session だから Chrome 動かせるんじゃないか」の仮説検証。

アンディに spawn して以下を Bash で実行させた（**実際の `claude --chrome` 起動はせずに capability 確認のみ**）：

```bash
1. claude --help 2>&1 | grep -i chrome
   → --chrome / --no-chrome フラグはあり
2. 現 session の Chrome 関連 MCP server / tool
   → なし
3. env | grep -i chrome
   → CLAUDE_CHROME 系環境変数 なし
4. ps aux | grep -i "claude.*chrome"
   → 既存 claude --chrome プロセス あり 2 本（裕司が手動起動したもの）
```

判定：**できない**。

## How to apply

- **note 投稿 / 対外 Web 操作で Claude Chrome を使う運用**は、引き続き「**裕司が手動で `cd /Volumes/SSD2TB/interventionworks && claude --chrome` 起動 → 指示テンプレ paste**」の craft で行う
- Team agent / subagent には Chrome 駆動タスクを振らない
- 「楽したい」ではなく「**確認 craft**」の文脈で検証することは価値ある（craft 知見が確定する）

## 将来の craft 候補

もし将来「team agent から Chrome 駆動」を実装したい場合：

- A. FleetView 設定で team agent 起動コマンドに `--chrome` を追加（現状不明な craft）
- B. Playwright MCP server を inject して Chrome 操作 tool を team agent に持たせる（別ルート craft、note.com の認証セッション持ち回しが面倒）
- C. Anthropic が「session 内 Chrome subprocess」みたいな tool を将来出してくれる craft（待ち）

これらは現状 unimplemented。検討した場合は Claude Code Radar に置く価値あり。

## 周辺メモ

検証中の bonus 発見：裕司、その日のうちに `claude --chrome` セッション 2 本起動済だった（朝 9:09 と午後 15:55）。これに裕司本人が気付いてなかったので、横で見てるアンディ / ベッキーが ps aux で気付くことに craft 価値あった。

## 関連

- `working/reference_note_publishing_via_chrome.md` — note 投稿 craft の本筋（裕司手動）
- `working/reference_claude_code_radar.md` — 将来 Chrome tool 出たらここに記録
