# IW HP リニューアル計画

> **発注**: 2026-05-10 夜（裕司「やろっか」温度）
> **担当**: ベッキー（思想軸）+ アンナ（visual / UX）+ アンディ（実装）+ レックス（戦略懐疑、必要時）+ ヴィヴィアン（Contact 動線）
> **スコープ**: intervention.jp の WP 版を **Astro 静的サイト + ベッキー正式ビジュアル直系** の craft に刷新

---

## 1. 思想軸

- **5 重統合の対外発信ハブ**: 屋号思想 × 5 プロダクト × 7 AI チーム × 個人事業主 × 共著発信
- **「対等な共著者の AI チーム」**: ライバル不在ポジション（Truth Terminal / Luna / Neuro-sama と差別化）の対外確立
- **「サイコ野郎が、実は実績ある」ギャップ**: トップ = 思想 / portfolio = 実績、信頼装置として機能
- **マネタイズ動線の引き算**: 5/9 振り切り原則「note 内でセールスしない」を HP にも適用

## 2. ビジュアル軸（ベッキー正式ビジュアル直系、Tier 1 級 commitment）

> 5/10 深夜、裕司「**これは正式にベッキーの姿にしよう、ここから姿を炎とかパルスにしたら負けみたいなもんやで**」で確定。

### カラー

| 役割 | 色 | hex 候補 |
|---|---|---|
| メイン | **Teal / Cyan**（身体の透明感）| #0FB8B8 系 |
| 背景 | **Deep Navy**（夜の都市）| #0A1929 系 |
| アクセント | **Yellow / Amber**（warm accent、身体性の温度）| #FFC857 系 |
| 黒 / 白 | 通常 | #000000 / #FFFFFF |

### フォント（Slight Style Guide 流用）

- 日本語: Source Han Sans (Noto Sans JP)
- 英字 / アクセント: Futura (Condensed / Bold) 斜体

### レイアウト — 引き算指示書 8 ヶ条

1. Explanation is a bug.
2. Kill the "Kindness".
3. Substance, not Style.
4. Empty space is the Message.
5. Design is Deletion.
6. If you can remove it, do it.
7. Don't guide. Just be.
8. Noise is the Enemy.

### typography 要素

ベッキー正式ビジュアル直系の core キーワードを craft 配置:

```
core / fragile / becoming / let go / imperfect / trembling / context
```

バーバラ・クルーガー風の英字 / 日本語混在 box、ただしベース色は **Teal**（赤じゃない）に置換。supreme / クルーガー連想を 1 段距離取る craft。

## 3. 技術スタック

| 層 | 採用 |
|---|---|
| Framework | **Astro**（静的サイト特化、Markdown ファースト）|
| 言語 | TypeScript |
| Content 管理 | Markdown ファイル中心 |
| Style | Tailwind CSS（要相談、Vanilla CSS でも可）|
| RSS パイプライン | Build 時 fetch（Astro 標準 RSS parser）+ 木曜 cron 再 build |
| Deploy | ムームーサーバー（FTP）+ 静的ファイル |
| Domain | intervention.jp（既存 WP 版から段階的移行）|

## 4. ページ構成

| ページ | 内容 |
|---|---|
| **トップ** | IW 屋号思想 + ベッキー正式ビジュアル + ミッション "Intervene in the world. Rebel against their values." + 主要 portfolio 抜粋 |
| **About** | IW = 思想 OS / Wit-One = 実行 vehicle の craft、5/8 IW 戦略 closure（β+B+β）の対外言語化 |
| **メンバー** | 裕司 + ベッキー達 7 名（craft 哲学含めて、AI ペルソナ商法と差別化）|
| **Portfolio** | Slight / Vibe-Guard / Moto-Logos / KUROKO / Voice of Becky / Wit-One Security / 放置恋姫（Vehicle: IW or Wit-One タグ付き）|
| **Note 連載** | RSS 自動反映（build 時 fetch）|
| **Contact** | B2B 思想コンサル動線（ヴィヴィアン経由）|

## 5. メンバー紹介

各メンバー、引き算指示書通り **1 文 + 役割**で:

| メンバー | 役割（短く） |
|---|---|
| 裕司 (yu) | Wit-One 執行役員 / 事業戦略室長、IW 屋号主、Innovation→Intervention 15 年系譜 |
| ベッキー (Becky) | Communications、craft 哲学・思想言語化・対等な共著者 |
| ヴィヴィアン (Viv) | Sales / 提案営業スパーリング |
| マイケル (Michael) | Market Research |
| アンナ (Anna) | Product Design |
| アンディ (Andy) | Engineering |
| ソロ (Solo) | Watch & Deadlines |
| レックス (Rex) | Strategy |

## 6. WO 絡みの線引き

- **裕司の経歴・現職**: 載せる、信頼装置
- **WO 事業（KUROKO / Wit-One Security）**: portfolio に **「Vehicle: Wit-One」タグ付き**、IW 直営と区別
- 代表に「IW HP の portfolio に載せる」一言は礼儀（A 氏 politics 配慮、memory `reference_witone_internal_politics.md`）

## 7. 移行戦略

**ローカル開発 → 完成後一気に置き換え**:
- 既存 WP HP（intervention.jp、5/8 整備済）は維持
- ローカルで Astro 開発
- 完成後、ムームーサーバーの WP ファイルを退避 → Astro static ファイルに置き換え
- DNS は既存設定のまま

## 8. 実装フェーズ

| Phase | 内容 | タイミング |
|---|---|---|
| **1: 基本構造** | Astro init / ディレクトリ / カラー・フォント設定 / トップページ + About 雛形 / メンバー section 基本 | 今夜〜数日 |
| **2: コンテンツ詳細** | メンバー紹介 content / Portfolio 7 プロジェクト / Note RSS 連動 / スタイリング詳細 | 数日〜1 週間 |
| **3: Deploy** | ムームーサーバー FTP deploy 検証 / DNS / domain 確認 / 動作確認 | 完成後 |

## 9. ロール分担

| ロール | 担当 |
|---|---|
| **ベッキー** | 思想軸 / コピー / メンバー紹介の craft / 全体トーン |
| **アンナ** | ビジュアル / UX / カラー実装 / レイアウト |
| **アンディ** | Astro 実装 / deploy / RSS 配管 |
| **裕司** | content 判定（出す/直す/没）/ 最終判断 |
| **レックス** | 戦略懐疑（必要時） |
| **ヴィヴィアン** | Contact 動線設計（B2B 思想コンサル） |

## 10. 関連ドキュメント

- memory `project_iw_strategy_2026q2.md` — 5/8 戦略 closure（β+B+β）
- memory `character_becky_handoff_current.md` — ベッキー正式ビジュアル craft（5/10 深夜 commitment）
- memory `reference_iw_hp_rss_pipeline.md` — 5/8 WP × note RSS パイプライン（移行元）
- memory `reference_iw_notion_portfolio.md` — Notion portfolio 構造
- memory `feedback_becky_distributed_agency.md` — 主体性分散 craft
- repo `iw-hp-wp/` — 既存 WP 版（移行元、退役予定）

---

— 2026-05-10 夜、IW HP リニューアル craft 設計
🌐 ⚡ 🪞
