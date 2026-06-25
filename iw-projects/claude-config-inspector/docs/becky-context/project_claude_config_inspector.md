# claude-config-inspector — Becky Context

## 概要

Claude Code の構成（memory / skills / MCP / hooks 全部）を HTML でまとめて表示するツール。

**ゆうの動機（2026-06-25）:** 「会社でClaude構成の話してたんだけど / 構成もVibe構築だから理解してない / なんか重い・出力が安定しないけど原因がわからない / を何とかしたい」

---

## 場所・起動

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/claude-config-inspector
npm run build
node dist/cli.js [cwd] --html    # HTMLレポート生成 + ブラウザで開く
node dist/cli.js [cwd]           # CLIテキスト出力
node dist/cli.js [cwd] --diagnose  # 診断のみ（将来拡張用）
```

---

## 現状（2026-06-25 時点）

| 指標 | 修正前 | 修正後 |
|---|---|---|
| MCP検出件数 | 0件 | 5件 |
| Memory検出件数 | 3件 | 213件 |
| Skills検出件数 | 4件 | 17件 |
| スコア（バグ修正後） | 74点 | 100点 |
| スコア（診断機能込み） | — | 88点 |

診断スコア: `100 - (error×20 + warn×8 + info×2)`
現在の減点項目: Context行数(warn) + UserPromptSubmit hooks(info) + Skills17件(info)

---

## 主要バグ修正（2026-06-25）

1. **MCP検出**: `settings.json` だけ見ていた → `mcp.json` + `enabledPlugins` の2箇所を追加で読む
2. **Memory検出**: パスエンコードで先頭`-`を削除していた（`/Volumes` → `Volumes` → ディレクトリ存在しない）+ サブディレクトリ再帰スキャン追加
3. **Skills検出**: `~/.claude/skills/` を見ていなかった → 追加

---

## ソース構成

```
src/
  cli.ts          — エントリポイント（--html / CWD引数）
  inspector.ts    — ConfigSnapshot取得ロジック
  html-reporter.ts — HTMLレポート生成
```

---

## 今後の展望

- 「Context行数が多い警告」への具体的な改善提案
- プロジェクト間の構成差分比較
- 定期チェック（cron）対応
