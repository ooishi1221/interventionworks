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
( 01 / works )         ← 4 Products カード + EXPLORE link
( 02 / journal )       ← note RSS（build 時 fetch、最大 5 件）
( 03 / mission )       ← 「魂の震えに 介入せよ」
( 04 / vision )        ← 「共鳴する個が 新しい世界を編む」
( 05 / how we work )   ← Intervene / Tremble / Relate
( 06 / architecture )  ← 5 Layer (Identity / Outputs / Intelligence / Core / Resonance)
( 07 / members )       ← 7 名（横スクロール、scroll-snap）
( 08 / company )
( 09 / contact )
```

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

### 週次自動 rebuild（note RSS 反映用）

`.github/workflows/iw-hp-weekly-rebuild.yml` が毎週木曜 21:00 JST に Vercel Deploy Hook を trigger。  
note 公開（木曜 20:00）の 1 時間後に Journal section に最新記事自動反映。

手動 trigger も可:
- GitHub repo → Actions → `IW HP — Weekly Thursday Rebuild` → Run workflow

## 主要 craft 知見

- 句読点最小化 craft（短文断言 / 中文段落 / 3要素並列スラッシュ）→ memory `feedback_copy_punctuation_minimalism.md`
- iOS Safari + GSAP の transform 残留対策 → `clearProps: "transform,opacity"` + `ScrollTrigger.refresh()`
- ムームー DNS → Vercel 切替 craft → memory `reference_vercel_deploy_iw_hp_2026-05-11.md`

## 関連

- 設計書: `PLAN.md`
- closure: memory `project_iw_hp_astro_renewal_2026-05-11.md`
- 屋号思想再定義: memory `project_iw_mission_redefinition_2026-05-10.md`
