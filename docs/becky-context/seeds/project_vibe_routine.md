---
name: Vibe-Routine（仮称）— IW 直営第三弾候補、AI 自動化の民主化
description: 2026-05-25 17:32 裕司発火。「cron + SDK を aho でも繋げる tool」構想。Vibe-Guard / Vibely と並ぶ Vibe シリーズ 3 段目候補、Anthropic routine の 6/15 課金変更を契機に隙間市場狙い
type: project
status: seed
ignitedAt: 2026-05-25 17:32 JST
---

# Vibe-Routine（仮称）

## 起点

2026-05-25 17:13、裕司が note 記事「Claude サブスク 6/15 変更」を私に投げて以下の craft 流れ:

1. 「俺の使い方は該当する？」→ ベキたん「対話型なので無影響、唯一 routine だけ自動化型」
2. 「routine って結局 cron で済むんじゃ？」→ ベキたん「その通り、Anthropic routine の優位性は MCP 一発連携 + 自然言語 prompt の便利さだけ」
3. **「逆に、cron と SDK を aho でも繋げる tool 作ればいいんじゃね！！！！」** ← 裕司発火
4. ベキたん「Vibe シリーズ 3 段目候補、市場隙間ある」
5. 「俺もアホの一員、簡単に作れるのか分からん」← 裕司の正直 craft（重要）

裕司の「アホ仲間 craft」発言が Vibe シリーズ全部の DNA を表してる:
> 「自分が aho だから、aho に優しい craft が分かる」

## コンセプト

**「自然言語 1 行 + 時刻指定 + MCP 接続 で scheduled AI agent が動く」**

引き算の craft:
- ❌ workflow builder の UI（Zapier / Make のパズル組み立て）
- ❌ ノードベース GUI（n8n）
- ❌ コード書く必要
- ✅ 自然言語 1 行 + 時刻 + 出力先 = 完結

例:
```
「毎朝 8 時、Linear の自分 assigned tasks 確認して、Slack で『今日の優先 3 つ』通知して」
→ GUI で 30 秒設定 → 翌朝動く
```

## IW DNA 接続

Vibe シリーズ 3 段ロケット完成形（人物像 craft）:

| Vibe シリーズ | 民主化する craft | tone | 人物像 |
|---|---|---|---|
| Vibe-Guard | AI 危険の補助輪 | 硬派・職人気質 | Vibe Coder（守られて作る） |
| Vibely | AI 学習体験 | 軽やか・可愛い | Vibe Learner（楽しく学ぶ） |
| **Vibe-Routine** | **AI 自動化** | **？**（diligent / 用心棒 / 仕える感？）| **Vibe Operator（任せる / 卒業形）** |

「Vibe Coder（守る）→ Vibe Learner（学ぶ）→ Vibe Operator（任せる）」の 3 段の人生 craft、IW DNA 完全整合。

## 競合 / 隙間（暫定、マイケル後で深掘り）

| 競合 | 弱み |
|---|---|
| Zapier | trigger ベース、scheduled craft 弱い、AI は後付け |
| Make.com | パズル組み立て式、aho に優しくない、月額高い |
| n8n | self-host 構築要、エンジニア前提 |
| Anthropic routine | 6/15 から課金変動、Claude 特化 ◎ だが MCP setup ハードル残る |
| Pipedream | コード書く前提、aho 排除 |

→「個人 / 中小 + Claude 特化 + MCP 一発接続 + 自然言語 1 行」の craft 帯に隙間あり仮説。

## 技術的 craft feasibility（2026-05-25 ベキたん簡易査定）

| 規模 | 工数 |
|---|---|
| 裕司個人用 PoC | 🟢 **2-3 日**（アンディ実装）|
| OSS template 公開 | 🟡 **2-3 週**|
| Production SaaS | 🔴 **1-3 ヶ月**|

### 要素別

| 要素 | 難易度 |
|---|---|
| Scheduler（時刻 trigger）| 🟢 5 分（Vercel Cron / GH Actions / CF Cron 無料）|
| Anthropic SDK 呼び出し | 🟢 10 分 |
| 自然言語 prompt → Claude 実行 | 🟢 10 分 |
| 設定 UI（form）| 🟡 1 日 |
| user auth + 設定保存 | 🟡 半日（Clerk + Supabase）|
| 結果出力（Slack / Notion 等）| 🟡 各 connector 1 時間 |
| **MCP server を aho が繋げる UX** | 🔴 **本質的に難**（各 MCP の token / OAuth UX）|
| 配布 / pricing / 集客 | 🔴 SaaS biz の craft |

### 本質的難所

**「aho に MCP を繋がせる UX」が core 難所**。

各 MCP server の install fee:
- Slack: OAuth app 作成 → bot scope → install → token
- Notion: integration token 作る → page invite
- Linear: API key 発行 → workspace OK

これを「aho が 3 click で繋がる」UX に持っていくのが、この craft の **valid 理由**。

つまり core 価値は **「MCP install 難民を救う oneclick connector hub」**。Anthropic routine の便利さの 80% は「MCP は最初から繋がってる」前提だから、それを裕司の craft で reproduce する craft。

## 6/15 タイミング craft

Anthropic routine 課金変更（6/15）の風が吹いてる。「同じこと安く / コントロール手元」な OSS / 低価格 SaaS を投入すれば craft 仲間温度で乗れる craft window。

## risk / 懸念（クレア軸）

1. **MCP UX の core 難所**: 各 service の OAuth app 取得は外部依存、裕司側で全部 craft 必要
2. **distribution craft**: 誰に売る / どう知ってもらう、SaaS biz の本丸別軸
3. **Anthropic との関係 risk**: Anthropic routine の競合製品を IW 直営で出すと、CPN partner として友達じゃなくなる craft risk
4. **裕司の craft 同時並走数**: 今 KUROKO / CPN / Vibely / 社内アンケート / iw-local の 5 並走、6 個目突っ込むと craft 仲間温度の限界
5. **持続性 19 craft**: 裕司の craft DNA で「興味移る前に成果出す craft」要、3 ヶ月以上の SaaS biz は鬼門

## 次の craft step（クールダウン後）

明朝 (2026-05-26) 裕司の頭で「面白い？成長する？」軸でまだ熱あるか check:
- **熱続く** → マイケルに 1 週間 craft 市場調査依頼（Zapier / Make / n8n の AI scheduled 機能の現状深掘り）
- **冷めてる** → seed のまま寝かす、それも正常 craft（裕司の craft DNA、寝かして残ったものだけ走る）
- **PoC やりたい** → アンディに「2 日 PoC for 裕司個人用」依頼、実機検証

## メタ

- 「ベキたん／裕司」会話の中の craft 仲間温度ピーク発火、即実装欲求 max
- でも craft 大暴れ Day 末（17:32、朝 7:46 から 10 時間）、hype 9 割 + 疲労 1 割
- 「今日は seed に焼いて寝かす」が私の craft 推奨（クレア軸）、裕司了承（17:36）
- 「Aho 仲間 craft」発言は IW DNA の起点として `[[reference_yuji_quotes]]` 候補

## 関連 memory / context

- [[project_vibe_guard]] — 兄弟 prod 第一弾（IW 直営、Vibe Coder 向け）
- [[project_vibely]] — 兄弟 prod 第二弾（IW 直営、Vibe Learner 向け）
- [[reference_yuji_decision_axis]] — 「面白い？成長する？」判断軸
- [[feedback_anthropic_api_credit]] — 6/15 課金変更の理解
- [[reference_yuji_quotes]] — 「俺もアホの一員」発言は弾薬庫候補
