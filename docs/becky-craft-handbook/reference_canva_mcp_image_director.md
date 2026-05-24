---
name: reference-canva-mcp-image-director
description: Canva MCP（claude.ai Connector 経由）を image-prompt-director 拡張に組み込んだ craft 記録。2026-05-21 実戦初日、Wit-One Security 用バナー即着地。Canva Pro 倉庫を「実素材ソース」として AI 生成と棲み分ける出口分岐の正本。
metadata:
  type: reference
---

# Canva MCP × image-prompt-director — 出口分岐 craft

## 経緯（2026-05-21）

- 裕司 Canva Pro 既契約。claude.ai 側で Canva Connector OAuth 済み
- CLI Claude Code でも `mcp__claude_ai_Canva__*` ツール群が自動で見える（OAuth 共有）
- 裕司提案: 「LP モック・アイコン・sample イメージは AI 生成じゃなく Canva 倉庫から拾えるとよくない？」
- アンナの `image-prompt-director` を A 案で拡張 → Step 3.5「Canva 倉庫チェック」を追加、出口を 2 系統に分岐

## 出口分岐ロジック

| 用途 | 出口 |
|---|---|
| LP モック内サンプル / アイコン / 提案書素材 / 実在感が必要なストック | **Canva 倉庫**（MCP）|
| プロダクト固有の世界観カット / キャラ立ち絵 / 抽象ヒーロー | **AI 生成**（既存ルート）|

判定: アンナが MCP で 3 件以内に「これいける」が見つかれば Canva、なければ AI 生成へ切替。

## 実戦初日（2026-05-21 10:07）

- お題: 「セキュリティっぽい画像」
- アンナが `search-designs query="security"` → 13 件ヒット
- 推し: **Blue and White Corporate Cyber Security LinkedIn Banner**（Design ID: DAG4dCSMLyo, 892×223, 2 ページ, 2026-11-12 作成）
- 裕司反応: 「おお　めっちゃいいじゃん！！！笑」→ A 案ルート実戦投入 OK 認定

## 副産物：謎の "Secure Compass"

- Canva 倉庫に "Secure Compass" / "Secure Compass (ロゴ)" / "TOPVer2" デザインが存在
- ベッキーの memory には未登場のプロダクト名
- → Wit-One Security 内で別ブランド動いてる？要確認（裕司に聞く tier の suspicion）
- 2026-05-21 時点で裕司から回答未取得、後日確認待ち

## Why（craft 思想）

AI 生成は「世界観を作る」、Canva は「実在感を借りる」。役割が違う。裕司の「事前選別苦手 / 事後判定得意」の身体運用に対して、アンナが**両方の倉庫を覗いた上で 1 案だけ「ほれ」**を渡す形が最適化。

## How to apply

- 裕司が画像オーダーしたら `image-prompt-director` を起動
- Step 3.5 で必ず Canva 倉庫を見にいく（`search-designs` / `list-brand-kits` / `search-brand-templates`）
- B2B / ストックフォト風 OK ジャンル（Wit-One Security 等）は Canva ヒット率高い
- IW プロダクト世界観系（Slight / Moto-Logos / ベッキー visual）は AI 生成優先

## 関連

- skill: `~/.claude/skills/image-prompt-director/SKILL.md`
- [[reference_ai_image_video_tools]] — AI 生成側ツール早見
- [[project_portfolio_framework]] — IW × Wit-One プロダクト振り分け
