---
name: Codex plugin (openai/codex-plugin-cc) 運用ルール
description: Claude Code から OpenAI Codex を呼んでレビュー・調査委譲する時の役割分担・ベストプラクティス。2026-07-16 導入 + 実地検証済み
type: reference
originSessionId: 3e6ddf32-8cb5-40a7-99ab-8b842af1c265
---

`/plugin marketplace add openai/codex-plugin-cc` で導入する、Claude Code から Codex を呼び出すプラグイン。ChatGPT サブスク(Free 含む)か OpenAI API key + Node.js 18.18+ が必要。

参考: https://zenn.dev/akasara/articles/d1303ce284a33f

## 役割分担の核

**Claude が実装、Codex が独立した査読者。** 自動でレビューループを回すと無限往復で API 枠を浪費するので、**手動・非同期が基本**。常時自動 review gate(`/codex:setup --enable-review-gate`)は基本オフのままでいい。

## コマンド

- `/codex:review` — 読み取り専用の普通のレビュー。誘導不可(focus テキスト非対応)
- `/codex:adversarial-review [focus text]` — 設計判断・トレードオフに疑問を投げる「挑戦的」レビュー。誘導可能。**高リスク変更(API ゲートウェイ、DB マイグレーション、並行処理まわり)はこっちを使う**
- `/codex:rescue` — バグ調査・fix 試行を委譲。依頼時は「最小限のスコープ・明確な成功条件・無関係なリファクタ禁止」を明示すること
- `/codex:status` `/codex:result` `/codex:cancel` — バックグラウンドジョブ管理

## 実務 Tips(2026-07-16 実地検証)

**1コミットだけを狙い撃ちしてレビューしたい時:** `--base <対象コミットの直接の親>` を使う。`git log --oneline -1 <commit>^` で直接の親を確認してから指定しないと、間に無関係な複数コミットが挟まって diff が巨大化する(実測: 間違った base 指定で 70 ファイル分の diff になった → 直接の親に修正したら 1 ファイルに収まった)。

```bash
git log --oneline -1 <commit>^   # 直接の親を確認
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" adversarial-review --wait --base <直接の親> "focus text"
```

**サイズ見積もりは `--wait` か `--background` かの判断に使う:** 1-2 ファイルの小さい変更なら待つ、それ以上ならバックグラウンド推奨。

**実例:** `platform_scraper.py` の Chrome 自動起動ロジック(46行の小さい追加)に adversarial-review をかけたら、`needs-attention` 判定 — cron の多重起動でロック無しの check-then-start が競合し、Chrome プロセス/出力ファイルが二重書き込みされるリスクを指摘された。小さい diff でも一発で有効な指摘が出た。

## config

`.codex/config.toml` でモデル・コスト推論レベル(`effort`)を調整可能。`high` あたりから段階的に下げて様子を見るのが無難。

## チームルールへの反映

Codex を呼ぶ基準(いつ review、いつ adversarial-review、いつ rescue か)は各プロジェクトの CLAUDE.md に明記した方がチームで判断がブレない。IW 内ではまだ未整備 — 使用実績が増えたら判断軸をここに追記する。
