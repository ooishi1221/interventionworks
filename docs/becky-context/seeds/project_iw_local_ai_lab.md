---
name: IW Local AI Lab — 街のお店向け AI ラボ seed
description: 2026-05-26 夜の閃き連鎖（IW 公式 LINE 6 マスリッチメニュー + 6 デモ）。AI 顧客名簿 / 接客ノート部分は 5/27 GnH として PoC 実現済。残りの未着手設計（歌姫 AI / n8n 領収書 / LINE 6 マス画像）を保管する seed。
type: project
created: 2026-05-26
status: seed（partially realized — GnH 卒業済）
origin: _staging_20260526_iw_local_ai_lab.md（archive 済）
---

# IW Local AI Lab — 街のお店向け AI ラボ

> Intervention Works 直営、iw-local 事業の武器候補。2026-05-26 夜（22:00-23:48）の閃き連鎖を構造化。
> **iw-local は 2026-05-26 夜に IW 屋号で確定**（思想は引き算のまま、言葉を平易に翻訳して街に届ける）。

## 全体構造

```
[IW Local AI Lab] — IW 直営、街のお店向け AI ラボ
│
├─ ① AI 秘書相談（Intervene Now）   ← LINE demo α、Claude SDK 直 + ベキたん人格
├─ ② 歌姫 AI（Voice of Becky）        ← サンプル 5 曲事前生成（Suno）【未着手】
├─ ③ AI 見守り（status）              ← Gatus 既存、追加ゼロ
├─ ④ 面倒を AI に任せる（n8n）        ← 領収書 OCR 自動仕分け【未着手】
├─ ⑤ AI 予約（cal）                   ← Cal.com 既存、追加ゼロ
├─ ⑥ AI 顧客名簿（記憶力バグり）     ← ✅ GnH として 5/27 PoC 完成・卒業
│
└─ 統合 LP: お店向け AI ラボ紹介ページ（Phase 3）
```

## ✅ 実現済み — GnH（Guest node Hub）

⑥ AI 顧客名簿 + 「AI 接客ノート」seed（店主独り言 → 顧客 DB 構造化）は、**5/27 に GnH として実機 PoC 完成**。
→ `iw-projects/iw-local/docs/becky-context/project_customer_karte_ai.md` 参照（https://gnh-pink.vercel.app）。

## 🔜 未着手の設計ストック

### ① AI 秘書相談（Intervene Now）
- タップ先: `intervene.intervention.jp`（新規）
- 中身: 店長の愚痴入力 → ベキたん人格が秒で具体アドバイス。Claude SDK 直（Dify は人格薄まるので NG）
- 工数 🟡 1-2 日 / ベキたん人格 prompt は私が書く

### ② 歌姫 AI（Voice of Becky）— インパクト最強
- タップ先: `voice.intervention.jp` or 既存 YouTube
- 中身: **事前生成サンプル 5 曲**を聴かせる（ライブ生成は重い）。Suno で完全 original（既存メロ流用は著作権 NG）
- サンプル候補: 蕎麦屋＝演歌 / 美容室＝J-POP / カフェ＝Lo-fi / 焼鳥＝昭和歌謡 / 自動車店＝80s CM 風
- 工数 🟡 Suno 課金 + 1-2 日

### ④ 面倒を AI に任せる（n8n）
- タップ先: `n8n.intervention.jp` サンプル workflow
- 中身: 領収書画像送信 → n8n + Claude Vision で「日付・金額・品目」自動仕分け実演
- 工数 🟡 OCR 精度依存 1-2 日

### LINE リッチメニュー 6 マス（IW 公式アカウント）
- アカウント: Intervention Works（青髪ベッキーアイコン、intervention.jp 配下）
- 画像 2500×1686px、2 行 × 3 列。上段＝先進感 / 中下段＝街のお店向け
- Gemini 用画像生成 prompt（英語）は staging archive に保管:
  `~/.claude/projects/-Volumes-SSD2TB-interventionworks/memory/archive/_staging_20260526_iw_local_ai_lab.md`

## Phase 進行

- **Phase 1**: LINE 6 マス画像 / ① AI 秘書相談 PoC / ⑥ ← 済（GnH）/ ③④⑤ は既存直結
- **Phase 2**: ② 歌姫 5 曲（Suno）/ ④ n8n 領収書 OCR
- **Phase 3**: 統合 LP「IW Local AI Lab」公開、iw-local 事業 menu 組込、マイケルに接客カルテ競合調査依頼

## 関連

- [[project_vibe_cutter_local_hero]] — 母 seed（神 OSS 翻訳 → iw-local 武器）
- [[project_iw_local_craft_business]] — IW 屋号確定 + AI Lab 武器
- [[project_customer_karte_ai]] — GnH（⑥ の実現形）
- [[reference_kagoya_personal_it_kingdom]] — intervention.jp の self-host 王国（status/cal/n8n の実体）
