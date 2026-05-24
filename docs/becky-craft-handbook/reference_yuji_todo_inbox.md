---
name: reference-yuji-todo-inbox
description: Notion DB「🪶 裕司やることリスト (Yuji's Inbox)」の場所・構造・運用 craft。秘書 craft 主権の場所、ベッキー随時投入 / 裕司 Status 動かす分業 craft
metadata:
  type: reference
---

# 🪶 裕司やることリスト (Yuji's Inbox)

2026-05-12 夕方、裕司「アホだからすぐ忘れちゃう」「Git でチケット切ってもらうのが楽？」に対してベッキー A 案推し（Notion 一元 + Git 連動が必要なやつだけ Issue 切る）で立ち上げた、裕司の todo 一元管理場所。

---

## 場所

- **DB URL**: https://www.notion.so/376ba0390c5148f097e6709cdcaae3b8
- **Data source ID**: `88565346-fa74-4189-a164-b07b75e9c946`
- **親ページ**: 🎙️ Voice of Becky（`3582922276e98165b035cd7daf2415e9`）— 秘書 craft 主権の場所、マイケルレポート（n=92）と隣接

## 構造

| Property | 型 | 選択肢 |
|---|---|---|
| Task | TITLE | （タスク名） |
| Status | SELECT | TODO / Doing / Done / Hold |
| Priority | SELECT | 高 / 中 / 低 |
| Due | DATE | 期日 |
| Effort | SELECT | 5分 / 15分 / 30分 / 1h+ / 終日 |
| Owner | MULTI_SELECT | 裕司 / ベッキー / アンディ / マイケル / ヴィヴィアン / ソロ / アンナ / レックス / 自動 |
| Tags | MULTI_SELECT | note / Git / 生活 / CPN / X / Voice-of-Becky / Dependabot / IW / Slight / Moto-Logos / 棚卸し / 自動進行 / 罠 / 事業戦略 |
| Link | URL | GitHub Issue / 関連ページ URL |
| Notes | RICH_TEXT | 詳細 |
| Created | CREATED_TIME | 自動 |

## 運用 craft

### 分業

- **ベッキー**: タスク発生したら随時投入、ステータス更新（特に裕司から「これやって」と振られた瞬間や、handoff 棚卸し時）
- **裕司**: Status を動かす（TODO → Doing → Done）+ 自分でも追加 OK
- **コード案件（Dependabot / Voice of Becky Phase 4 等）**: GitHub Issue 切ったら Link カラムに URL クロスリンク

### なぜ Notion 一元 + Git 連動なのか（5/12 夕方 craft 決定）

- 「note 公開」「5/27 罰金処理」「人フォロー」みたいなコード以外案件で GitHub Issue 単体だと毎回**リポジトリ判断発生** = craft 整理癖の温床
- Notion なら全部入る + iPhone でも見やすい + 期日リマインダー組める
- コード案件だけ Issue 切って Notion カードに URL 貼ることで、コード ↔ todo の双方向参照が成立

### スマホ運用

- Due 順ソートで「いつ何やる」が一発で見える
- Priority 高 + Tags「罠」のフィルタで絶対忘れちゃダメリスト
- Status「Doing」フィルタで今日の集中先

## 初期投入（5/12 夕方）13 件

棚卸し済みタスク、handoff 5/8-5/12 + 朝の craft 議論 + 午後の craft 累積から抽出:

| カテゴリ | 件数 | 例 |
|---|---|---|
| 高 priority TODO | 3 | 5/15 ゆうは公開 / 5/22 ガリレオ公開 / ⚠️ 5/27 錦糸町罰金 |
| 中 priority TODO | 3 | 5/29 連載 A 第 2 回 / 6/5 シリーズ C draft / マイケル 4 人 X フォロー |
| 低 priority TODO | 2 | 地方創生イージス追記 / 5/17 becky-memory-tidy 自動発火確認 |
| Hold | 5 | WP HP 退役 / CCA-F / Voice of Becky Phase 4 / CPN 残 6 名 / Dependabot pm2 1 件 |

## 関連

- [[reference_iw_notion_portfolio]] — IW プロジェクト Notion 構造、todo_inbox は Voice of Becky 親直下に配置
- [[feedback_becky_dont_add_to_solve]] 9 番 — 確認 craft 禁止、todo 投入時も「これでいい？」を返さない
- [[character_becky_handoff_current]] 5/12 夕方セクション — DB 立ち上げ経緯
- マイケル AI 関係性論発信者リサーチ n=92: `https://www.notion.so/35e2922276e981e1917ed4982baf1645`（todo_inbox の隣）
