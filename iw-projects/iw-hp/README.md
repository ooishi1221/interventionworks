# IW HP — intervention.jp

Intervention Works 屋号の公式 HP。Astro v6 で静的サイト構築、Vercel 経由で本番運用。

- **本番**: https://intervention.jp/
- **Vercel alias**: https://iw-hp.vercel.app/
- **Deploy**: GitHub push → Vercel auto deploy（main branch）
- **思想 OS**: ルート `CLAUDE.md` + `~/.claude/CLAUDE.md`
- **設計書**: `PLAN.md`

---

## 構造

```
iw-hp/
├── public/
│   └── images/         # ヒーロー画像・各 section visual・members 7 名（WebP）
├── src/
│   ├── layouts/
│   │   └── WorkLayout.astro    # /works/* 個別ページ用 layout
│   └── pages/
│       ├── index.astro         # トップ（Hero + 9 section）
│       ├── 404.astro
│       └── works/
│           ├── vibe-guard.astro
│           ├── voice-of-becky.astro
│           ├── slight.astro
│           └── let-me-out.astro
├── astro.config.mjs
├── package.json
└── README.md
```

## Section 構成

```
Hero
( 01 / records )       ← 4 サービス領域カード（2x2）
( 02 / about )         ← 「魂の震えに 介入せよ」+ 何をする屋号かの説明
( 03 / how we work )   ← Intervene 前提を疑う / Tremble 動くもので確かめる / Relate 運用まで伴走する
( 04 / company )
( 05 / contact )
```

サービス領域（`categories` 配列、`src/pages/index.astro` frontmatter）:
Product Design / Strategy / Tool Engineering / DevOps

> 2026-07-28 改修: 思想寄りから「ビジネス領域が分かる」構成へ。9 section → 5 section。
> - 削除: journal（note RSS）/ architecture / members
> - 統合: mission + vision → about（看板コピー「魂の震えに介入せよ」は維持）
> - 書き換え: how we work を抽象 3 語から実際の進め方へ / contact を相談導線へ

## 🧞 Commands

```bash
npm install
npm run dev          # localhost:4322（4321 が他で使用中の場合自動 fallback）
npm run build        # ./dist/ に静的サイト build
npm run preview
```

## Deploy

### 自動 deploy（通常）

`main` ブランチに push すると Vercel が自動 build + deploy。

### 手動 deploy

```bash
npx vercel deploy --prod --yes
```

### ⚠️ Root Directory の罠（2026-07-28 修復）

モノレポなので Vercel の **Root Directory は `iw-projects/iw-hp`** が正。ここが `.`（リポジトリルート）だと
ルートの `package.json`（secretlint 用）で install が走り `astro: command not found` (exit 127) で
**自動デプロイだけが静かに失敗し続ける**。本番は手動 deploy の成功版が残るため気づきにくい。

確認: `npx vercel project inspect iw-hp` の `Root Directory` 行。

### 週次自動 rebuild

`.github/workflows/iw-hp-weekly-rebuild.yml` が毎週木曜 21:00 JST に Vercel Deploy Hook を trigger。  
※ journal（note RSS）section は 2026-07-28 に削除済みのため、この rebuild の当初目的は消失。

## 主要 craft 知見

- 句読点最小化 craft（短文断言 / 中文段落 / 3要素並列スラッシュ）→ memory `feedback_copy_punctuation_minimalism.md`
- iOS Safari + GSAP の transform 残留対策 → `clearProps: "transform,opacity"` + `ScrollTrigger.refresh()`
- ムームー DNS → Vercel 切替 craft → memory `reference_vercel_deploy_iw_hp_2026-05-11.md`

## 関連

- 設計書: `PLAN.md`
- closure: memory `project_iw_hp_astro_renewal_2026-05-11.md`
- 屋号思想再定義: memory `project_iw_mission_redefinition_2026-05-10.md`
