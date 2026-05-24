---
name: Notion API text substitution trap
description: Notion API が markdown 投入時に特定文字を自動変換する craft 罠。誤字発見 + 迂回 craft 必要
metadata:
  type: reference
---

# Notion API 文字自動変換 craft 罠

2026-05-20 Wit-One AI 浸透度調査 Notion 企画書作成中に発見。
[[reference_ai_proofreading_pdf_ocr_trap]] の Notion 版、同種の craft 罠。

## 確認された変換パターン

| 元原稿（書いた） | Notion 上で表示 |
|---|---|
| 二**軸** | 二**軽** |
| **冒**頭 | **冲**頭（複数箇所）|
| 戦略 | **戰**略（旧字混在）|
| 事例 | **由**例 |
| **現**状 | **现**状（中国語簡体字 U+73B0）|
| GO に向けて | **ゴール**に向けて |
| インセンティブ | **イベント** |
| 半角 `3` | 全角 `３` |
| 200 名 → **400 名** に勝手に変わった疑い | 不明 |

## 観察

- `notion-create-pages` で送った content（Markdown）の一部が、Notion 側のレンダリングで literal に書き換わる
- 特に：**漢字異体字（現 → 现）**、**全半角数字**、**特定の単語**（軸 → 軽、冒 → 冲、事例 → 由例、GO → ゴール、インセンティブ → イベント）
- Anthropic / Claude 側で発生か、Notion API 側で発生かは未特定

## 対処 craft

### 直接修正は再変換される

`notion-update-page` で「现」→「現」と update しても、再 fetch すると「现」に戻ってる。同様に「閲読約３分」→「閲読約 3 分」も全角に戻る。

→ **直接置換は効かない**。

### 迂回 craft（語彙書き換え）

「変換される単語そのものを使わない」craft で回避：

- 「現状」 → **「利用状況」「現在の利用状況」**
- 「閲読約３分」 → **「読了 3 分」**
- 「冒頭」 → 大丈夫だった例もある、ケース次第
- 「事例」 → 「由例」が表示されたら別の語彙へ書き換え
- 「インセンティブ」 → 「意欲」「動機付け」

## 検証時の craft

Notion ページ作成・更新後は **必ず notion-fetch で再読込し、文字単位で確認**する。書いた通り保存されてると思い込まないこと。

特に代表 / 経営層向けの資料では、誤字 1 つで信頼コスト発生する。**裕司に渡す前にベキたん自身で fetch 確認**を craft 化。

## 関連

- [[reference_ai_proofreading_pdf_ocr_trap]] — PDF OCR の craft 罠、Gemini が PDF 由来の幽霊指摘を返す現象、本件と同種
- [[project_witone_ai_survey_launch]] — 本案件の出元

## 残課題

- どの文字 / 単語が変換対象なのか、網羅的リスト未完成
- 「200 名」が一部「400 名」に変わってた疑い、未検証
- Notion API のバージョンや時期で変換パターンが変わる可能性
