---
name: Claude Code Radar (Notion DB + Weekly routine)
description: Claude Code の新機能・プラクティスをトラッキングする Notion DB と、それに週次投入する remote routine の場所。マイケルがリサーチ時に使う。
type: reference
originSessionId: 705d7cd4-0147-4532-bd74-60f312f2f02d
---
## Notion Database
- **Title**: Claude Code Radar
- **URL**: https://www.notion.so/95d4bfbbaeab4ecf99f5b8a0cff2fd51
- **Database ID**: `95d4bfbb-aeab-4ecf-99f5-b8a0cff2fd51`
- **Data Source ID** (notion-create-pages/notion-search で使う): `03b3fc84-a86d-423e-a0b3-3e639be65b63`
- **Parent**: 🏴 組織マニュアル (Intervention Works Edition) — `34b29222-76e9-810b-946f-f485f79e797d`

## Schema
- Title (title), Source URL (url), Discovered At (date), Tier (select: Tier 1/2/3), Status (select: New/Trialing/Adopted/Skipped), Owner (select: ベッキー/ヴィヴィアン/マイケル/アンナ/アンディ/ソロ/レックス), Notes (rich_text)

## Remote Routine (週次cron)
- **Name**: Claude Code Radar - Weekly
- **Trigger ID**: `trig_01JYt739updjVe7JP9pg7WPq`
- **Schedule**: `0 23 * * 0` UTC = 毎週月曜 08:00 JST
- **初回実行**: 2026-04-27 (月) 08:00 JST
- **Model**: claude-sonnet-4-6
- **MCP**: Notion connector
- **Git repo**: なし (WebFetch + Notion MCP のみで完結)
- **管理**: https://claude.ai/code/routines/trig_01JYt739updjVe7JP9pg7WPq

## 監視対象 Tier 1 ソース
1. https://docs.claude.com/en/docs/claude-code/overview (changelog / what's-new)
2. https://api.github.com/repos/anthropics/claude-code/releases
3. https://www.anthropic.com/news
4. https://www.anthropic.com/engineering
5. https://api.github.com/repos/anthropics/skills/commits

## 運用ルール (3段階)
1. **Discovery**: routine が New で投入
2. **Trial**: 裕司 が気になれば Status を Trialing に → 1週間試用
3. **Adopt**: 効いたら Adopted、ダメなら Skipped

## 備考
- 初回実行時は既存行が少ないので routine が自動的に過去30日を取得して初期シード
- ハートビート方針: 発見ゼロでも 1 行残す (routine が死んでないか確認用)
- エラー時も 1 行残す (Title: `週次チェック失敗 (YYYY-MM-DD)`)
