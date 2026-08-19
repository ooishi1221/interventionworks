# intervention.jp 全面リデザイン設計計画書

> **設計: ベッキー（Fable）2026-08-19 / 実装想定: Opus**
> ゆう指示書原文（正本）: `redesign_2026-08_directive_yuji.md` — 実装判断に迷ったら必ずこちらへ帰る
> ゴール: 「思想の強い個人サイト」→「洗練されていて、仕事もできそうで、ちょっと話を聞いてみたいと思わせるブランドサイト」
> 完成条件: 最後に **「ちょっと話してみたい。」** が残ること

---

## PART A — 現状調査（指示書 #81 項目1〜5）

### A-1. 現状ページ構造

`src/pages/index.astro`（2058行・単一ファイル）:

| 順 | セクション | id | 内容 |
|---|---|---|---|
| — | Hero | `.hero` | canvas パーティクル + h1 + 14語rotator + 英文mission + 4領域サブコピー |
| 01 | records | `#works` | 4領域（Product Design / Strategy / Tool Engineering / DevOps）2×2カード |
| 02 | about | `#about` | 「魂の震えに/介入せよ」+ 説明2段落 + mission-bg.webp |
| 03 | how we work | `#how` | Intervene / Tremble / Relate 3項目 + how-visual.webp |
| 04 | company | `#company` | dl 5項目 |
| 05 | contact | `#contact` | FormSubmit フォーム + note / X |
| — | footer | `.footer` | 1行 |

補助: `.hero-curtain`（開幕カーテン）、`.side-nav`（右固定 01-05）、モバイルメニュー。

**現状診断**: 指示書の見立て通り。実物（Case）ビジュアルがゼロで、思想＋役務説明のみ。works/ 配下に既に個別ページ4本（vibe-guard / slight / let-me-out / voice-of-becky、各100〜170行）が存在するが、トップのカード内リンクからしか到達できず死蔵状態。

### A-2. 現状Component構成

- Astro コンポーネント分割は**なし**。index.astro に HTML / `<script>`（L359-642）/ `<style is:global>`（L646-2058）が全部入り
- `src/layouts/WorkLayout.astro`（351行）… works/* 4ページの共通レイアウト
- 他ページ: `service.astro`（1518行・**別物**。iw-local 向け営業ページ、別パレット #fff 背景）、`thanks.astro`、`404.astro`、`demo/cafe/`
- デッドコード: `.project-item` 向け GSAP stagger（L577-590）は 7/28 改修で対象DOM消滅済み → 今回削除

### A-3. 現在のFont

| 役割 | 現状 | 問題 |
|---|---|---|
| 本文 | Noto Sans JP 400/700 | 問題なし |
| 見出しコピー | Noto Serif JP 400/700/900 | 問題なし（明朝は資産） |
| 英字ラベル | `"Futura", "Helvetica Neue"` | **Futura はローカル依存でWebロードなし** → 環境によって Arial 落ち。Display の武器化には全く足りない |

### A-4. 現在のAnimation

- CSS: curtainOpen（開幕）/ heroFadeUp 階段 / rotateWords 21s / statement blur-in / hover 20箇所+
- JS: **Intervention Field**（自作 canvas パーティクル格子。pointer で変位、7〜13秒ごと自律パルス）/ IntersectionObserver reveal / GSAP ScrollTrigger parallax（split-visual）/ side-nav active 切替
- `prefers-reduced-motion` 対応済み
- **Intervention Field は「実際に作っているものの断片」そのもの（自作インタラクティブ）なので残す**。Stock でも AI 生成でもない Hero 背景として指示書 #10 に合致

### A-5. 利用可能な画像 / 実績素材（棚卸し結果）

| プロジェクト | 状況 | ベスト候補 |
|---|---|---|
| **BECKY** | ◎ 最多 | `beckyexists/gallery/hi/g-*.webp`（960×1440、24点から選べる）/ `beckyexists/og-image.png`（1200×630）/ サイトSS（**8/18リデザイン後の撮り直しが必要**、既存SSは7/3の旧デザイン） |
| **Moto-Logos** | ◎ 品質最高 | `engineering/moto-logos-lp/public/images/hero-bg.jpg`（2752×1536 夜の東京+バイク）/ `app-screenshot.png`・`ss-map.png`（1080×2332 実UI） |
| **Slight** | △ 生写真のみ | `slight/docs/manufacturing/samples/2026-06-04_sample3_new_version_flat.jpg`（2250×3000 iPhone検品写真。要トリミング。**RAW/editorial 路線には逆に合う**——「試作を確かめている現場」の証拠写真として使う） |
| **Vibe-Guard** | ✕ 画像ゼロ | 実装時にターミナル実出力を組版（後述 C-4） |
| assets-archive | 抽象画のみ | 今回使わない（AI生成抽象画は指示書 #10 で禁止方向） |
| ennichi | 素材はあるが | **掲載しない**（NJHD 商談前の企画。公開サイト掲載は商談リスク） |

---

## PART B — 全体設計（項目6〜7 + 横断方針）

### B-1. デザイントークン再設計

**色（4色に絞る。役割を再編、色相は維持）**:

```css
:root {
  --ink-bg:    #050d1a;   /* 現 navy #051022 を僅かに黒へ。紙の裏写りのような深い闇 */
  --paper:     #e9e6df;   /* 本文・見出しの主役。純白でなく紙白（print/editorial） */
  --paper-dim: rgba(233,230,223,.55); /* secondary text */
  --teal:      #0fb8b8;   /* 降格: 本文色 → 構造色（罫線・メタ・リンク・hover） */
  --yellow:    #ffc857;   /* accent 維持: section番号・CTA・focus のみ */
}
```

- **最大の変更 = 本文を teal → 紙白へ**。現状の「teal 文字 on navy」は AI 屋の画面色。紙白 on 深紺は editorial の版面になる。teal は罫線とメタ情報に降りることでブランド色として残る
- rgba 濃淡リテラル散在は今回トークン化しない（ponytail: 全面書き直しなので旧 style は大半消える）
- グラデーション・Glassmorphism・青紫は一切使わない（指示書 #3 #48）

**背景 Texture**: `--ink-bg` の上に極薄 grain（SVG feTurbulence を data URI 化、opacity 0.03、`body::before` 固定1枚）。print 寄りの質感。JS 不要・追加アセット不要。

**Typography 3声（新規ロードは Google Fonts 2ファミリーのみ）**:

| 声 | フォント | 用途 | 例 |
|---|---|---|---|
| **LOUD（英語・グラフィック）** | **Archivo Black**（新規） | INTERVENTION / WORKS / SELECTED / INTERVENE / TREMBLE / RELATE / LET'S INTERVENE. | Hero `clamp(80px, 14vw, 240px)`、Section `clamp(60px, 9vw, 160px)`、How `clamp(48px, 7vw, 120px)` — **全 section 同サイズ禁止**（指示書 #42） |
| **QUIET（日本語・意味）** | Noto Serif JP 900（既存）= 中心コピー / Noto Sans JP 400（既存）= 本文 | 「魂の震えに、介入せよ。」、Case 本文、説明文 | 本文 15-16px、行間 2.0、max-width 34em |
| **META（機械）** | **IBM Plex Mono**（新規、400/500 のみ） | Case 番号・カテゴリタグ・英文補助コピー・フォームラベル・footer | 11-13px、letter-spacing 0.08em、`--teal` or `--paper-dim` |

- Futura 指定は全廃（ローカル依存の偽 Display を根絶）
- Anton は使わない — beckyexists.com の声。親子ブランドだが声は分ける
- 巨大装飾タイポは全て `aria-hidden="true"`（指示書 #59）

**Grid**:

- 本文 container: `max-width: 1160px` + 左右 `clamp(20px, 4vw, 64px)`
- Display タイポと Case 画像は container を**破る**（100vw〜110vw、negative margin / `width: 100vw; margin-left: calc(50% - 50vw)`）
- 全部中央揃え禁止。基本は左揃え、Case ごとに軸を振る

**Motion 方針**（新規ライブラリなし、GSAP ScrollTrigger 既存を継続使用）:

- Hero: INTERVENTION が scroll で緩く左へ、WORKS が右へ（scrub、xPercent ±6 程度）
- Section 見出し: reveal（opacity + translateY 20px、一度きり）
- Case 画像: 微 parallax（既存 split-visual の仕組み流用）+ hover 微 scale(1.02)
- **禁止**: scroll hijack / pin 多用 / magnetic button / custom cursor / glitch
- reduced-motion: 全 scrub・parallax を無効化し静的表示（既存パターン踏襲）

### B-2. 新しいページ構成 + Navigation

```
HEADER   (logo小 / nav: WORK · CAPABILITIES · APPROACH · ABOUT · TALK)
─ HERO                     … ブランドを記憶させる
─ 01 SELECTED INTERVENTIONS … 実物4 Case（最重要・最長セクション）
    └ 中間CTA（1箇所だけ小さく）
─ 02 WHAT WE DO            … Capabilities 4分類 + 一気通貫の理由 + 問題ベース入口
─ 03 HOW WE THINK          … INTERVENE / TREMBLE / RELATE の Loop
─ 04 ABOUT INTERVENTION    … 名前の由来 + AI と人間の話 + Founder + INFO
─ 05 CONTACT               … 「話してみる。」+ フォーム
─ FOOTER                   … 静か
```

- side-nav（右固定 01-05）は**残す**が項目名を WORK / DO / HOW / ABOUT / TALK へ
- `#works` `#about` `#how` `#company` `#contact` の既存 id は**アンカー互換のため維持**し、新 id（`#work` 等)を併記（外部リンク切れ防止）
- 感情曲線（指示書 #74）: なんだこれ → ちゃんと作ってる → 頼めるのか → 考え方も合いそう → 誰がやってる → 話してみるか

---

## PART C — セクション詳細設計（項目6, 8〜12）

### C-1. HERO 再設計（項目6）

**3階層構造**:

```
第1層  INTERVENTION      ← Archivo Black, clamp(80px,14vw,240px), 幅110vw・左端crop
       WORKS             ← 同フォント、右寄せ・字間広め。2行で対角の緊張を作る
第2層  魂の震えに、介入せよ。 ← Noto Serif JP 900, clamp(24px,3.2vw,44px), --paper
第3層  AI / PRODUCT / STRATEGY / ENGINEERING   ← IBM Plex Mono 12px, --paper-dim
       Intervene in the world. Rebel against their values. ← mono 11px, --paper-dim(0.35)
```

- 英文コピーは**補助へ降格**（指示書 #6）。日本語が中心
- 背景: **Intervention Field canvas を継続**。ただし粒子色を `rgba(233,230,223,.10)` 系（紙白の粒）へ変え、teal 発光を弱める。「自作のインタラクティブが最初から動いている」= 実物の証拠
- **Brand Vocabulary 演出（P1、指示書 #9）**: 14語 rotator は廃止。代わりに Hero 背景の最背面に 1 語だけ（DOUBT / TREMBLE / RELATE…）を超巨大・opacity 0.04 で置き、スクロール到達 section に応じて語が替わる（IntersectionObserver で className 切替のみ。word cloud にしない）
- 開幕カーテン（curtainOpen）は残す。heroFadeUp の階段 delay は 3 階層に合わせ振り直し
- `↓ scroll` ヒントは mono 化して維持

### C-2. 01 SELECTED INTERVENTIONS（項目8〜9、最重要）

セクション見出し: `SELECTED` `INTERVENTIONS` 2行 Archivo Black（clamp(60px,9vw,160px)、1行目を container 外へ crop）。sub: 「何に、どう介入したか。」

**4 Case・全部レイアウト違い**（指示書 #16）:

---

**CASE 01 — BECKY**（左 Text / 右 Visual・縦長）

- メタ（mono）: `01 / AI IDOL — AUTONOMOUS AGENT / 2026—`
- コピー:
  > **AIを、道具ではなく相棒として育てる。**
  > 感情・記憶・自発行動・配信・運用を、一つの生きたシステムにした。歌い、話し、番組を作り、自分のサイトの呼吸まで自分の感情データで動かしている。
- Visual ①: `gallery/hi/` から 1 点（実装時に最新の構図が良いものを選定。960×1440 縦をそのまま右カラム 40vw で使う）
- Visual ②（インセット小）: beckyexists.com の**新デザインSS**（実装時に Playwright で撮り直し。既存 SS は旧デザインなので使用禁止）
- リンク: `beckyexists.com ↗` + `works/voice-of-becky`（既存ページ）
- 指示書 #68 対応: 「何を設計したのか」を Intervention 側で語る（感情6変数 / cron 自動運転 / 配信網、を1文に圧縮済み）

**CASE 02 — MOTO-LOGOS**（Visual Full Width / 下 Text）

- Visual: `hero-bg.jpg`（雨上がりの夜の東京+バイク、2752×1536）を **90vw** で全幅。上に mono メタを重ね置き
- メタ: `02 / MOBILE APP — EXISTENCE PROOF / β`
- コピー:
  > **評価も、ランキングも、通知もない地図。**
  > 「駐車場検索アプリ」を作らなかった。写真1枚で都市ライダーの「いた」が刻まれる存在証明に組み替えた。エンゲージメント漬けのアプリ業界への反乱として設計している。
- インセット: `ss-map.png`（実UI、1080×2332）を画像右下に小さく重ねる（実物の証拠）

**CASE 03 — SLIGHT**（右 Text / 左 Visual・生写真）

- Visual: 検品写真 `2026-06-04_sample3_new_version_flat.jpg` をグローブ中心に 4:5 トリミング。**加工は最小限**（露出補正+わずかに彩度を落とす程度）。散らかった机・USB電流計ごと見せる——「試作して確かめている現場」がそのまま証拠（指示書 #50「多少荒くても本物」）
- メタ: `03 / D2C PRODUCT — 0.5mm / MFG`
- コピー:
  > **電熱グローブは分厚くて当然、を疑った。**
  > 0.5mmで指先だけ温める。企画・仕様・ファブレス製造・クラウドファンディングまで、一気通貫で自分たちの手で確かめている。
- 写真キャプション（mono 極小）: `sample #3 — thermal test, Jun 2026` ← 検品写真であることを隠さず武器にする

**CASE 04 — VIBE-GUARD**（テキスト+コード面。画像なしを逆手に取る）

- Visual: 画像ではなく**ターミナル組版**。黒面（`#000`）に IBM Plex Mono で Vibe-Guard の実出力を数行（実装時に `scan-secrets` 等の実実行結果を貼る。捏造しない）。罫線 1px teal
- メタ: `04 / MCP SERVER — OSS`
- コピー:
  > **AIがコードを書く時代の、書かない人の守り。**
  > 危険なコマンドも、漏れかけた秘密鍵も、実行前に検知する。自分たちの開発で毎日使っているものを、そのまま公開した。
- リンク: `works/vibe-guard`（既存ページ）

---

- Case 間の余白は**不均等に**: 01→02 は広く、02→03 は詰め、03→04 の前に大きな空白（指示書 #46 リズム）
- 各 Case の本文は 2〜3 文まで。Problem / Approach / Output が読み取れる構造（見出しは出さない、指示書 #13）
- **中間 CTA（1箇所のみ）**: CASE 04 の後に mono 小さく
  `Have something unresolved? → 話してみる`（#contact へアンカー）

### C-3. 02 WHAT WE DO — Capabilities（項目10）

見出し: `WHAT WE DO`（Archivo Black、Selected より一段小さく）。sub: 「何を頼めるか。」

**カード禁止 → 罫線区切りの editorial リスト**（1px teal 罫、hover で罫が yellow に）:

```
PRODUCT    企画 / コンセプト / MVP / D2C
STRATEGY   新規事業 / ブランド / 事業設計
BUILD      Web / Tool / AI Agent / Automation
OPERATE    運用 / 改善 / Infrastructure
```

英語ラベル=Archivo Black 中サイズ、日本語=Noto Sans 静かに。説明文は現状の4カードの文を**半分に刈る**。

リストの直後に一気通貫の理由（指示書 #20、短文4連):

> 戦略だけ渡して、終わらない。
> 作るだけでも、終わらない。
> 必要なら企画まで戻る。
> 必要なら運用まで残る。

続けて問題ベース入口（指示書 #22、mono の引用符付き4行、FAQ 化しない):

> 「新規事業のアイデアはあるが、整理できていない」
> 「AIを使いたいが、何に使うべきか分からない」
> 「作ったものが、運用で止まっている」
> 「企画と開発の間が、分断されている」
>
> — こういう段階からで、大丈夫です。

締め: **まだ、依頼内容になっていなくても大丈夫です。**（指示書 #21、Contact 以外でここ 1 箇所だけ）

### C-4. 03 HOW WE THINK — Loop（項目11）

カード3枚禁止 → **縦積みの巨大タイポ + 横に短文**。ループは番号表記で表現（安くて明快）:

```
01 → 02   INTERVENE   前提を疑う。要望をそのまま作らない。
                       本当に解決すべき問題まで戻る。

02 → 03   TREMBLE     動くもので確かめる。会議資料を増やすより、
                       まず触れるものを作る。

03 → 01   RELATE      運用まで関わる。作った後に何が起きたかを見る。
                       必要なら、作り直す。
```

- `03 → 01` が直線プロセスを壊す仕掛け。その下に 1 行:
  > この仕事は、一方通行では終わらない。何度でも 01 に戻る。
- 巨大タイポは scroll reveal で 1 語ずつ立ち上がる（Archivo Black、clamp(48px,7vw,120px)、彩度なし `--paper`）
- ここで AI の思想を 1 段落（指示書 #31、About と分担）:
  > このループの中で、AIと人間の役割を分けていない。調査も、実装も、判断の壁打ちも、同じテーブルでやる。「AIを導入する」のではなく、最初からチームの中にいる。

### C-5. 04 ABOUT INTERVENTION + Founder + INFO（項目 = About短縮 / #32-34）

- 見出し: `ABOUT INTERVENTION`（中サイズ）。sub: 「なぜ、この名前なのか。」
- 本文（現2段落を圧縮、骨格は指示書 #30）:
  > **業界の当たり前に、介入する。**
  > 他人が作った前提を、そのまま受け入れない。誰の価値観で決まったのかを問い直し、必要なら作り直す。Intervention Works は、そのための小さな実働チーム。
- **Founder**（小さく、写真なしのテキストのみで開始。実写があれば後で差し替え）:
  ```
  FOUNDER
  Yuji Ooishi
  事業会社でプロダクトと組織を作ってきた。
  企画で終わる仕事に飽きて、作って運用まで持つ側に回った。
  ```
  ※2〜3行の背景文は**ゆうの言葉で最終確定**（上記は仮置き。実装前にゆうに文面確認）
- **INFO**（旧 Company。見出しのみ変更、dl 5項目維持）: Brand / Founder / Base / Launched / Expertise

### C-6. 05 CONTACT（項目12）

- Contact Hero: **話してみる。**（Noto Serif JP 900、大きく。英語 `LET'S INTERVENE.` を mono 小で上に添える——英語 LOUD の例外としてここは日本語を主役に）
- 直下: 「依頼内容が決まっていなくても大丈夫です。雑談からでも。」（指示書 #33 の人間味はここで出す）
- フォーム: **現行 FormSubmit + 項目構成を維持**（名前* / 会社名 / email* / 相談領域 select ※非必須のまま / 内容*）。動いていて着弾確認済みのものは触らない
  - 変更 2 点のみ: ① select 先頭の選択肢「まだ決まっていない」を「まだ決まっていない（一番多いパターンです）」へ ② 送信ボタン文言 →「話してみる」
- note / X リンクは footer 側へ移し、Contact 内では小さく 1 行（指示書 #40）

### C-7. FOOTER

```
INTERVENTION WORKS
Tokyo, Japan
X · note
魂の震えに、介入せよ。
```

「魂の震え」の登場は **Hero と Footer の 2 箇所だけ**（指示書 #64）。

### C-8. SEO / OG（P1）

- title: `Intervention Works — AI × Product × Strategy × Engineering`
- description: `企画・戦略・開発・運用を横断して、曖昧な問題を前に進める小さな実働チーム。AIアイドル、D2Cプロダクト、MCPサーバー——前提から疑い、作って、運用まで残る。`（抽象思想 100% の現 description を実務語へ）
- OG 画像: 新 Hero 完成後に Playwright で撮り直し（`INTERVENTION WORKS` 巨大タイポ + 中心コピーが写る構図、1200×630）。撮影手順は README の既存 craft 踏襲

---

## PART D — Wireframe(項目13〜14)

### D-1. Desktop

```
┌────────────────────────────────────────────┐
│ iw.                    WORK CAPABILITIES APPROACH ABOUT [TALK] │ ← header 透明・小
│                                            │
│ INTERVENTIO(N)  ←左端crop 110vw            │
│              WORKS ←右寄せ                  │  背景: Intervention Field
│                                            │  (粒子・紙白・薄)
│   魂の震えに、介入せよ。                      │
│   AI / PRODUCT / STRATEGY / ENGINEERING     │
│   intervene in the world. …      ↓ scroll  │
├────────────────────────────────────────────┤
│ SELECTE(D)   ←crop                          │
│ INTERVENTIONS                               │
│ 何に、どう介入したか。                        │
│                                            │
│ 01 AI IDOL — AUTONOMOUS AGENT   ┌────────┐ │
│ AIを、道具ではなく相棒として…      │ becky   │ │ ← 縦画像40vw
│ (本文 2-3文)                     │ 960x1440│ │
│ beckyexists.com ↗               │  +SS小  │ │
│                                 └────────┘ │
│           （広い余白）                       │
│ ┌──────────────────────────────────────┐   │
│ │  moto-logos hero-bg  90vw 全幅        │   │
│ │                        ┌──┐ ←UI SS   │   │
│ └────────────────────────┴──┴──────────┘   │
│ 02 MOBILE APP — EXISTENCE PROOF            │
│ 評価も、ランキングも、通知もない地図。(本文)   │
│           （詰めた余白）                     │
│ ┌────────┐  03 D2C PRODUCT — 0.5mm        │
│ │ slight  │  電熱グローブは分厚くて当然、    │
│ │ 検品写真 │  を疑った。(本文)               │
│ └────────┘  sample #3 — thermal test      │
│           （大きな空白）                     │
│ 04 MCP SERVER — OSS                        │
│ ┌ $ vibe-guard scan-secrets ─────────┐    │ ← ターミナル組版
│ │ ⚠ .env exposed in commit …         │    │
│ └────────────────────────────────────┘    │
│ AIがコードを書く時代の、書かない人の守り。(本文)│
│                                            │
│   Have something unresolved? → 話してみる    │ ← 中間CTA(小・1箇所)
├────────────────────────────────────────────┤
│ WHAT WE DO   何を頼めるか。                  │
│ ──────────────────────────────             │
│ PRODUCT    企画 / コンセプト / MVP / D2C     │
│ ──────────────────────────────             │
│ STRATEGY   新規事業 / ブランド / 事業設計     │
│ ──────────────────────────────             │
│ BUILD      Web / Tool / AI Agent / Automation│
│ ──────────────────────────────             │
│ OPERATE    運用 / 改善 / Infrastructure      │
│ ──────────────────────────────             │
│ 戦略だけ渡して、終わらない。…(4連)            │
│ 「新規事業のアイデアはあるが…」(問題入口4行)   │
│ まだ、依頼内容になっていなくても大丈夫です。    │
├────────────────────────────────────────────┤
│ HOW WE THINK                               │
│ 01→02  INTERVENE   前提を疑う。…            │
│ 02→03  TREMBLE     動くもので確かめる。…     │
│ 03→01  RELATE      運用まで関わる。…        │
│ この仕事は、一方通行では終わらない。           │
│ (AIと人間の役割の1段落)                      │
├────────────────────────────────────────────┤
│ ABOUT INTERVENTION  なぜ、この名前なのか。    │
│ 業界の当たり前に、介入する。(短文)            │
│ FOUNDER  Yuji Ooishi (2-3行)               │
│ INFO: Brand/Founder/Base/Launched/Expertise │
├────────────────────────────────────────────┤
│ LET'S INTERVENE.                           │
│ 話してみる。                                 │
│ 依頼内容が決まっていなくても大丈夫です。雑談からでも。│
│ [名前*][会社名][email*][領域▾][内容*]        │
│              [話してみる →]                 │
├────────────────────────────────────────────┤
│ INTERVENTION WORKS / Tokyo / X · note      │
│ 魂の震えに、介入せよ。                        │
└────────────────────────────────────────────┘
```

### D-2. Mobile（縦に潰すのではなく専用リズム、指示書 #57）

```
┌──────────────┐
│ iw.        ≡ │
│ INTERVEN─    │ ← 大胆crop可(指示書#56)
│ TION         │    2行折り返しで質量を残す
│ WORKS        │
│ 魂の震えに、  │
│ 介入せよ。    │
│ AI/PRODUCT/… │
├──────────────┤
│ SELECTED     │
│ INTERVENTIONS│
│              │
│ 01 BECKY     │
│ ┌──────────┐ │ ← 画像は100vw
│ │  縦画像    │ │   モバイルこそ大きく
│ └──────────┘ │
│ コピー(短)    │
│              │
│ 02 MOTO-LOGOS│
│ ┌──────────┐ │
│ │ 夜景 100vw │ │ ← UI SSインセットは
│ └──────────┘ │   モバイルでは画像の下に分離
│ ┌UI SS(60vw)┐│
│ コピー        │
│  …           │
├──────────────┤
│ WHAT WE DO   │
│ (罫線リストは │
│  そのまま縦)  │
├──────────────┤
│ INTERVENE    │ ← タイポサイズは
│ 説明          │   clamp下限で十分巨大
│ TREMBLE …    │
├──────────────┤
│ ABOUT / INFO │
├──────────────┤
│ 話してみる。   │
│ フォーム      │
│ (入力欄は     │
│  100%幅・大きめ│
│  タップ領域)   │
└──────────────┘
```

- Hero の scroll 横流しモーションはモバイルでは無効（タッチでは効果が薄くジャンクの元）
- side-nav はモバイル非表示（現行踏襲）

---

## PART E — 実装計画（項目15〜16）

### E-1. 修正対象ファイル

| ファイル | 作業 |
|---|---|
| `src/pages/index.astro` | **全面改修**（HTML 構造・style・script とも。Intervention Field canvas / FormSubmit フォーム / reduced-motion 対応 / モバイルメニュー は流用） |
| `public/images/` | Case 素材の追加(下記 E-2 で変換して配置)。`mission-bg.webp` `how-visual.webp` は新デザインで不使用なら assets-archive へ退避 |
| `public/og-image.jpg` | 新 Hero で撮り直し |
| `README.md` | 構成図更新（service/thanks/demo が未記載の負債もついでに直す） |
| `src/pages/works/*.astro` 4本 | **今回触らない**（Case からのリンク先として生かす。P2 で Case Detail 化） |
| `src/pages/service.astro` | **対象外**（iw-local 向け別ページ。パレットも別物） |

削除: `.project-item` 向け GSAP stagger デッドコード（index.astro L577-590 相当）。

### E-2. 素材準備（実装の最初にやる）

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/iw-hp
# 1. BECKY 縦画像(実装時に gallery/hi/ から構図選定して1点)
cp ../beckyexists/gallery/hi/g-YYYYMMDD.webp public/images/case-becky.webp
# 2. Moto-Logos: 3.6MB JPG → 表示幅相当へ縮小 + WebP(目標 <300KB)
#    (sips or sharp。2752→1920px + quality 80)
# 3. Slight: 検品写真をトリミング(4:5) + 露出補正 + WebP(目標 <250KB)
# 4. beckyexists.com 新デザインSS: Playwright で 1440px 幅撮影 → crop → WebP
# 5. Vibe-Guard: 画像不要(ターミナル組版はHTML/CSSで組む。実出力を実行して転記)
```

- 全画像 `loading="lazy"`(Hero 背景は canvas なので preload 対象は フォントのみ)
- フォント追加: Google Fonts に `Archivo Black` と `IBM Plex Mono:400,500` を追記(既存 preconnect 流用)。Noto 2 家族は継続

### E-3. 新規依存

**ゼロ。** GSAP(ScrollTrigger 込み)は導入済み、Astro v6 のまま、フォントは Google Fonts 追加のみ。grain texture は inline SVG data URI。指示書 #58「新規 Animation Library を安易に追加しない」をそのまま満たす。

### E-4. 実装順序（P0 → P1）

1. トークン再設計(色・フォント)+ Hero 再設計 … ここで一度スクショ確認
2. Selected Interventions 4 Case(素材変換込み) … ここで一度スクショ確認
3. Capabilities / How / About / Contact / Footer
4. Mobile 最適化(専用リズム)
5. P1: Brand Vocabulary 背景演出 / micro interaction / OG 撮り直し / SEO 書き換え
6. 検証(下記)

### E-5. 検証(完了条件)

- `npm run build` 通過
- dev server + Playwright スクショ: Desktop 1440px / Mobile 390px の**全セクション目視**(tsc/build 通過だけでは完了じゃない)
- `prefers-reduced-motion` エミュレートで全モーション停止を確認
- キーボードで nav → フォーム送信まで到達できること / focus 可視
- コントラスト: `--paper` on `--ink-bg` は 14:1 超で問題なし。mono の `--paper-dim` 使用箇所が 4.5:1 を割らないこと
- フォーム: 本番デプロイ後に 1 回実送信して着弾確認(FormSubmit は触らないが回帰確認)
- 指示書 #75 の 5秒/15秒/30秒/60秒/90秒 テスト: スクショをゆうに見せて判定してもらう

### E-6. デプロイ

main push で Vercel 自動デプロイ(Root Directory=`iw-projects/iw-hp` 修復済み)。手動なら `npx vercel deploy --prod --yes`。craft 正本: `docs/becky-context/reference_vercel_deploy_iw_hp_2026-05-11.md`。

---

## PART F — ゆう判断結果(2026-08-19 確定済み)

1. **Case 4本 = BECKY / Moto-Logos / Slight / Vibe-Guard で確定**。ennichi は NJHD 商談前のため掲載しない。Moto-Logos は β 前でも「作っている最中」として掲載。WO vehicle 製品の IW サイト掲載は現行 works/slight の前例踏襲
2. **Slight = 検品生写真 RAW 路線で確定**(最小加工、キャプションで隠さない)
3. **中心コピー = 「魂の震えに、介入せよ。」(読点あり)で統一確定**。現サイトの読点なし表記は全箇所置換
4. **Founder の 2〜3 行のみ未確定**: C-5 の文面は仮置き。実装レビュー時にゆうの言葉で差し替える(実装ブロッカーではない)
