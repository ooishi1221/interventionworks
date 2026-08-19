# IW HP — intervention.jp

Intervention Works 屋号の公式 HP。Astro v6 で静的サイト構築、Vercel 経由で本番運用。

- **本番**: https://intervention.jp/
- **Vercel alias**: https://iw-hp.vercel.app/
- **Deploy**: GitHub push → Vercel auto deploy（main branch）
- **思想 OS**: ルート `CLAUDE.md` + `~/.claude/CLAUDE.md`
- **設計書**: `docs/redesign_2026-08_brand_site.md`（最新・正本）/ ゆう指示書 `docs/redesign_2026-08_directive_yuji.md` / 旧 `PLAN.md`

---

## 構造

```
iw-hp/
├── public/
│   ├── images/
│   │   ├── case-*.webp     # Case 4 本のビジュアル（becky / becky-site / motologos / motologos-ui / slight）
│   │   └── service/        # service.astro 専用（iw-local 向け営業ページ、別パレット）
│   └── og-image.jpg
├── assets-archive/         # ビルド対象外の退避庫（未使用画像。削除せず残す）
├── docs/
│   ├── redesign_2026-08_*.md   # 2026-08 リデザインの設計正本
│   └── becky-context/          # Vercel deploy craft
├── src/
│   ├── layouts/WorkLayout.astro   # /works/* 個別ページ用 layout
│   └── pages/
│       ├── index.astro         # トップ（Hero + 5 section）
│       ├── service.astro       # iw-local 向け営業ページ（トップとは別物・別パレット）
│       ├── thanks.astro        # フォーム送信後（noindex）
│       ├── 404.astro
│       ├── demo/cafe/          # デモ
│       └── works/              # vibe-guard / voice-of-becky / slight / let-me-out
├── astro.config.mjs
└── package.json
```

## Section 構成（2026-08-19 全面リデザイン）

```
Hero                      ← 巨大タイポ 2 層（INTERVENTION / WORKS）+「魂の震えに、介入せよ。」
01 SELECTED INTERVENTIONS ← Case 4 本。実物のビジュアルを大判で。最重要セクション
02 WHAT WE DO             ← Capabilities 4 分類（罫線リスト、カード禁止）+ 一気通貫の理由
03 HOW WE THINK           ← INTERVENE / TREMBLE / RELATE を Loop として（03→01 で戻る）
04 ABOUT INTERVENTION     ← 名前の由来 + AI と人間の話 + Founder + INFO
05 CONTACT                ← 「話してみる。」+ FormSubmit フォーム
```

Case 4 本（`src/pages/index.astro` の各 `<article class="case-0N">`。**全部レイアウトが違う**）:

| # | Case | レイアウト | ビジュアル |
|---|---|---|---|
| 01 | BECKY | 左 Text / 右 Visual | 稼働中の beckyexists.com 実物 SS + キャラをインセット |
| 02 | Moto-Logos | Visual 全幅 / 下 Text | 夜の東京の写真 92vw + 実 UI をインセット |
| 03 | Slight | 右 Text / 左 Visual | **検品の生写真**（机の生活感ごと。RAW 路線はゆう承認済み） |
| 04 | Vibe-Guard | 左 Text / 右 Terminal | 画像なし。`explain-command` の**実出力**を HTML で組版 |

> **2026-08-19 全面リデザイン**（ゆう指示書 81 項目）: 「思想の強い個人サイト」→「仕事もできそうで、話を聞いてみたいブランドサイト」。
> - **情報構造**: サービス説明より先に実物（Case）を見せる順序へ。records 4 カード → SELECTED INTERVENTIONS 4 Case
> - **配色**: 本文を teal → **紙白**（#e9e6df）へ。teal は罫線・メタ情報の「構造色」に降格。AI 屋の画面色をやめて editorial の版面にする
> - **Typography 3 声**: Archivo Black（英語 = LOUD・グラフィック）/ Noto Serif JP 900（日本語 = QUIET・意味）/ IBM Plex Mono（機械 = メタ情報）。**Futura 指定は全廃**（Web ロードがなくローカル依存で Arial 落ちしていた）
> - **Contact**: 「送信する」→「話してみる」。select 先頭に「（一番多いパターンです）」を添えて心理障壁を下げる。**FormSubmit の宛先・項目名は変更していない**（着弾実績があるものは触らない）
> - 落としたもの: Brand Vocabulary の背面演出（巨大タイポと重なり Texture でなく「二重の文字」に見えたため実測して撤回）/ 14 語 rotator / `.project-item` の GSAP デッドコード
> - 旧 id（`#works` `#company`）は空アンカーで互換維持

## GA4（2026-08-19 導入）

- **Measurement ID**: `G-QBR8XM8HV0` / 実装: `src/components/GA.astro`（全ページの head に挿入済み: index / service / thanks / 404 / works共通layout / demo/cafe）
- **DebugView 確認**: URL に `?ga_debug=1` を付けてアクセスすると debug_mode で送信され、GA4 の DebugView に流れる。Realtime は通常アクセスで即時反映
- **カスタムイベント**（全て発火を Playwright のリクエスト傍受で実測済み）:

| ページ | イベント | 発火条件 | params |
|---|---|---|---|
| index | `scroll_50` / `scroll_90` | スクロール到達、1回ずつ | percent |
| index | `case_view` | 各Caseが30%可視、1回ずつ | case_name (becky/moto-logos/slight/vibe-guard) |
| index | `contact_view` | Contactセクション可視 | — |
| index | `contact_start` | フォーム初回入力 | — |
| index | `contact_submit` | フォーム送信（beacon送信なので遷移前に届く） | area（相談領域） |
| index | `talk_click` | #contact へのアンカー | location (header/mid_cta/mobile_menu) |
| index | `case_becky_click` | beckyexists.com リンク | — |
| index | `case_click` | works/* 「設計を読む」 | case_name |
| index | `social_click` | footer X / note | network |
| /service | `scroll_50` / `scroll_90` | 同上 | percent |
| /service | `line_click` | lin.ee リンク（4箇所） | location (hero/inline/sticky/contact) |
| /service | `demo_request_click` | デモ「見てみる」リンク | demo (href) |
| /service | `faq_open` | FAQ を**開いた時だけ**（閉じは送らない） | faq_index / question |

- **⚠ GA4 管理画面でやること（コードからは制御不可）**: データストリーム → 拡張計測（Enhanced Measurement）の設定で、**「スクロール数」と「フォームの操作」を OFF** にする。ON のままだと EM 自動の `scroll`(90%) / `form_start` / `form_submit` が上のカスタムイベントと意味重複して二重計測になる（実測で併走を確認済み）。「離脱クリック」は名前が違う（`click`）ので残しても集計は混ざらないが、ノイズを嫌うなら OFF
- 旧構成向けに指示のあった `record_click` / `local_service_click` は、対象DOM（recordsカード・トップの/service導線）が 8/19 リデザインで消滅したため実装せず。後継は `case_click` / `case_becky_click` / `talk_click`（新構成のイベント設計を前倒し）

## 検証（リデザイン時に実測した項目）

`npm run build` 通過だけでは完了にしない。以下を Playwright で実測している:

- **dev server ではなく `dist/` を静的サーブして撮る**。dev の Vite 依存再最適化（`504 Outdated Optimize Dep`）が撮影中にリロードを挟み、reveal 未発火の真っ暗なスクショを撮ってしまう罠がある
- **要素スクショ（`element.screenshot`）を使わない**。viewport より大きい要素は内部の `.reveal` が未発火のまま撮れる。スクロールして viewport を撮る方式が実ユーザーと同じ
- Desktop 1440 / Mobile 390 の全セクション目視 / `prefers-reduced-motion` で全モーション停止 + 中身が最初から見えること
- Tab キーのみでフォーム送信ボタンに到達（honeypot `_honey` は `tabindex="-1"` でスキップされる）
- **コントラストは計算で済ませず実描画色で実測**。`--paper-dim` `--paper-faint` の alpha は WCAG AA(4.5:1) から逆算した値（18 箇所実測して全て AA 達成）

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
