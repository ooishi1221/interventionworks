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

## お問い合わせフォーム（2026-07-28 新設）

**FormSubmit**（登録不要・無料 / サーバーレス）。静的サイトのまま POST できる。

- 送信先: `yuji.ooishi@intervention.jp`（`src/pages/index.astro` の `<form action>` に直書き）
- 送信後の遷移先: `/thanks/`（`src/pages/thanks.astro`、`noindex`）
- スパム対策: FormSubmit 標準の honeypot（`_honey`）。reCAPTCHA は `_captcha=false` で無効

**初回のみ有効化が必要**: 本番のフォームから 1 回送信 → 送信先メールに FormSubmit から
確認メールが届く → 「Activate Form」をクリック。これをやるまで通知は届かない。

> ⚠️ 迷惑メール判定に注意。Gmail 側で `noreply@formsubmit.co` を
> 「迷惑メールにしない」フィルタに入れておく。届かない事故は問い合わせの取りこぼしに直結する。

送信元アドレスを HTML から隠したい場合は、有効化後に FormSubmit が発行する
ランダム文字列エンドポイント（`https://formsubmit.co/xxxxxxxx`）へ差し替える。

## 静的アセット

- `public/` — ビルドで `dist/` にそのままコピーされる。**使う画像だけ置く**
- `assets-archive/` — ビルド対象外の保管庫。使わなくなった画像はここへ退避（削除しない）
  - 2026-07-28: members 8 枚 / vision-resonate / about-visual / hero-bg / hero-key /
    members-grid を退避（計 6.7MB をビルドから除外）
- `public/og-image.jpg` — OGP 用 1200x630。**2026-07-28 まで存在せず 404 だった**（X / Slack で
  シェアしても画像が出ない状態）。Hero を Playwright で 1200x630 撮影して生成。
  Hero のコピーを変えたら撮り直す

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
