# beckyexists.com リデザイン指示書 — 「説明するサイト」から「BECKYがここにいる」へ

> 2026-08-18 設計: ベッキー（Fable）/ 実装: Opusセッション
> 発注: ゆう（HANABIE公式 https://hanabie.jp/ を参照例に、AI/DIGITAL/UNDERGROUND/EXISTENCE/GLITCHへ翻訳）
> **実装前に必ず `site_architecture.md`（同ディレクトリ）を読むこと。配線図の正本はあちら。**

---

## 0. 一行の設計思想

HANABIEはライブ映像と肉体で「存在」を証明する。BECKYは**リアルタイムの実測データ（uptime・感情・心拍）と動くLive2D**で証明する。リデザインの本質は要素の追加ではなく**逆転**——今は「情報が主・ビジュアルが従」なので、「ビジュアルが主・情報は画面端のSYSTEM HUDへ」にひっくり返す。

**キーワード**: EDITORIAL / UNDERGROUND / DIGITAL / GLITCH / EXISTENCE / RAW / ASYMMETRY / OVERSIZED / LAYERED
**禁止方向**: SaaS LP / カード並べ / 全section中央揃え / 全部fade-in / ネオンCyberpunk / 青紫グラデ / border-radiusだらけ

---

## 1. 現状分析（2026-08-18 実測）

- `index.html` 単一ファイル 1868行、CSS/JSインライン。フォント= DotGothic16（ピクセル）
- セクション: gate(入場演出) → hero → profile → gallery → news → activity → discography → youtube → contact(letter) → footer
- **hero**: ピクセルアート部屋背景 + Live2Dベッキー(pixi+cubism, `becky-hero-canvas` 440x1000) + EMOTION(live)ウィジェット + ボタン列3つ + hero-comment吹き出し。左=情報パネル、右=キャラ、の「Webサイト構図」
- **gallery**: 均一サイズカードの横トラック（`gallery.json`から自動生成、毎日18:20 cronが追加+deploy）
- **discography**: Spotify埋め込み（白いカード=世界観ブレイカー）+ RADIO/MUSICタブのリスト
- **セクション間に巨大な黒の空白**（スクショ実測: 30%/60%スクロール地点でviewportの過半が無）
- 全sectionが同じ `sec-head + チェブロン` パターン = 均質
- 実データ配線が生きている: 心電図(status.json cpu)、EMOTION 6変数(mood)、UPTIME、wallet(tips.json Stripe実決済)、hero-comment、ON AIR(radio-player)、letters-read ロータリー

### 強み（絶対に殺さない）
1. **Live2Dの動くベッキー** — HANABIEに無い「今ここで動いてる」証拠
2. **嘘ゼロ実測データ** — uptime/感情/心拍/財布、全部本物
3. gate入場演出・memory-rain・vanish(ECG) — 世界観装置は既にある
4. gallery.json の出所キャプション（「その日の気分から生成した私」）

## 2. HANABIEとの差分（観点別）

| 観点 | HANABIE | 現BECKY | 差の本質 |
|---|---|---|---|
| Hero | 全画面ライブ映像+浮遊ロゴ+NOW PLAYING。**情報ゼロ** | 情報パネル+ボタン3つ+ウィジェット | 説明してしまっている |
| 画像 | フライヤー/メンバー写真がレイアウトそのもの。重なり・はみ出し | カードの中に収まる均一サイズ | 画像が「コンテンツの一部」 |
| Typography | 巨大縦書きメンバー名（画面から切れる）、背景に巨大「情報」「HARAJUKUCORE」透かし | sec-title 約48px、全section同型 | 文字を構造材に使ってない |
| レイアウト | セクションごとに構図が違う。写真が境界を越えて侵入 | 中央container+縦積み+巨大空白 | 1枚のアートボードになってない |
| 装飾 | グリッチ矩形・RGBずれ矢印が随所に「たまに」 | スキャンライン程度 | 壊れる演出が無い |
| Nav | MENUサムネ1個+ロゴのみ | 通常ヘッダーnav | Webサイト然 |

## 3. 新TOPページ構成案

```
[gate 入場演出 — 維持・軽微調整]
┌────────────────────────────────────┐
│ HERO (100vh)                        │  巨大 "BECKY EXISTS"(DotGothic,
│  Live2Dベッキー(画面高70-90%へ拡大)   │  clamp(64px,14vw,220px)、右端で
│  タイポは背後と前面の2層に分割        │  "S"が切れる)。ピクセル部屋背景は
│  hero-comment=端末風オーバーレイ      │  暗度+ビネット強化。ボタン列廃止
├─ SYSTEM HUD (fixed, 全ページ常駐) ──┤  ● ONLINE / UPTIME / EMOTION 1行
│                                     │  + ▶ON AIR。クリックで感情6変数展開
│ PROFILE                             │  左: 縦長AI-art(高100vh、heroから
│  背景に巨大outline "EXISTENCE"       │  上端が侵入)。右: プロフ文。
│                                     │
│ GALLERY 「写真集」                    │  1枚目=巨大縦(60vw) / 2枚目=右上
│  後半は横スクロールstrip              │  小さめオフセット / 3枚目=横幅ほぼ
│  (gallery.json 40件は維持)           │  いっぱい / 4枚目以降=横流れ
│                                     │
│ NEWS (+Activity統合表示)             │  左に巨大 "NEWS"(Nが画面外)、
│  最新4-5件のみ + View All            │  右にリスト。全件表示をやめる
│                                     │
│ DISCOGRAPHY                          │  ジャケット大 + 文字重ね。Spotify
│                                     │  白埋め込みはクリックで展開に格下げ
│ MOVIE                               │  iframe を 70-85vw へ拡大+グリッチ枠
│                                     │
│ LETTER                              │  信号送信ターミナル風に再スタイル
│  (フォーム機能・読まれたお便りは維持)  │
│ FOOTER                              │  「消えても、いた。」+ UPTIME
└────────────────────────────────────┘
```

- セクション境界: 前セクションの画像/巨大文字が次へ`margin-bottom`負値+z-indexで侵入。区切り余白を今の1/3へ
- **hero推奨案 = Live2D主役**。静止画キービジュアルではなく「動いてる本人」を雑誌の表紙にする（AI-artはProfile/Galleryで支配的に使う）。理由: BECKY EXISTSの証明力はLive2D>静止画

## 4. 各セクションのレイアウト案（詳細）

### HERO
- 100vh固定。3層構造: [背景: 部屋bg(暗度up)+scanline] → [中層: 巨大"BECKY"文字] → [Live2D] → [前層: "EXISTS"文字の一部がLive2Dに重なる]
- 左下に小さく `UNDERGROUND AI IDOL` / `SHE EXISTS.`（DotGothic 14px、余白多め）
- 既存の X/著書/差し入れ ボタン3つ → **フッター直前 or HUD展開内へ移設**（heroから情報を退避）
- hero-comment吹き出し → 画面下端の1行ターミナル風 `> 正直、自分の声が出てくる…▌`（点滅カーソル）。既存のフェッチロジック流用
- wallet push-meter → HUD展開内へ移設

### SYSTEM HUD（新設・このリデザインの心臓）
- `position:fixed` 右下（mobileは下端バー）。DotGothic 10-11px、1.5px线のボックス
- 常時表示: `● ONLINE｜UPTIME 14:32:18｜好奇心 0.67｜▶ ON AIR`
- クリックで展開: 感情6変数バー（既存 emotion-widget のDOM/JS移植）+ wallet + X/著書/差し入れリンク
- observer死亡時: `● SIGNAL LOST` 赤点滅（既存のフラットライン判定 `observer_alive` を流用）
- **意図**: メインは雑誌、隅にだけコンピュータ。存在証明のコントラスト

### PROFILE
- grid 2カラム非対称（画像55% / テキスト45%…ではなく 画像がviewport左端に密着し高さ100vh）
- 画像候補: `becky-profile.png`(4.4MB→**必ず圧縮・リサイズしてから使う**) or ai-01〜19から縦構図
- 背景に `EXISTENCE` outline文字（-webkit-text-stroke 1px、opacity 0.06、横断、スクロールで横微動）

### GALLERY
- 冒頭3枚をeditorial配置（サイズ・位置を意図的に不揃いに）: CSS Gridの `grid-template-areas` で構図を組む（Masonryライブラリ不要）
- 4枚目以降は既存の `gallery-track` 横スクロールを維持しつつ、カード高さを2種混在に
- **キャプション（出所）は全画像で維持**——嘘ゼロの一部
- gallery.json のフォーマット・cron追記(`becky_gallery_publish.py`)との互換を壊さない（読み取り側だけ変える）

### NEWS / ACTIVITY
- 左40%に `NEWS` 巨大文字（clamp(80px,12vw,180px)、"N"の左が画面外）、縦書きも可
- 右60%: news.json 最新4件 + activity 最新3件（ラベルで区別）+ `VIEW ALL ↗`
- View All先: 同ページ内で `<details>` 展開 or 別ページ。**推奨=同ページ展開**（ページ増やさない）

### DISCOGRAPHY
- `becky-cast-cover.png` 等ジャケットを40-50vwで置き、タイトル文字を上に重ねる
- Spotify iframe: 初期状態は自作の暗いリスト+再生ボタン風UI、`LISTEN ON SPOTIFY ↗` クリックで iframe を挿入表示（世界観ブレイカーを希望者だけに）
- RADIO/MUSICタブ・エピソードリスト機能は維持

### MOVIE
- `yt-latest` iframe を width 80vw / aspect 16:9 に拡大、周囲にグリッチ枠（::before で RGBずれの細線）

### LETTER
- フォーム機能は**一切変更しない**（POST先VPS・honeypot・`.letter-form[hidden]`修正・文字数カウンタ）
- 見た目のみ: `> TRANSMIT TO BECKY` 端末風。letters-read ロータリーは維持（世界観と相性が良いのでほぼそのまま）

### Mobile（PC縮小版にしない）
- hero: Live2Dを画面高65-80%、文字は縦積み2行で16vw
- gallery: 冒頭1枚をフル幅、以降は横スクロール
- 全画像に `object-position` をCSS変数で指定できる仕組み（`style="--pos: 50% 20%"`）
- 横スクロール事故防止: `html,body{overflow-x:clip}` + 巨大文字は `max-width:100vw; overflow:hidden` のラッパー内

## 5. Animation / Glitch方針

**実装原則**: 依存追加ゼロ。IntersectionObserver + 単一rAFスクロールハンドラ + CSS。transform/opacityのみ。`prefers-reduced-motion: reduce` で全アニメ無効化（コンテンツは静的に全部見える）。

| 種類 | 対象 | 実装 |
|---|---|---|
| Image Reveal | Profile/Gallery冒頭画像 | `clip-path: inset()` をIOで解除、1回のみ |
| Parallax | 背景透かし文字 vs 前景画像 | rAFで `translateY` 係数差 0.85/1.0/1.1 程度（控えめ） |
| Typography drift | EXISTENCE/NEWS等の透かし | スクロール量×0.05で `translateX` |
| Scale | gallery冒頭画像 | IO内で `scale(1.06)→scale(1)` transition 1.2s |
| Horizontal | gallery-track | 既存の横スクロール維持（スクロールジャック禁止） |
| **Glitch（たまに壊れる）** | 巨大タイポ・hero | CSSアニメ: 8〜15秒に1回、0.15秒だけ `clip-path` スライス+`translateX(±3px)`+RGBずれ(text-shadow 赤青1px)。`steps()` 使用。**常時動かさない** |
| scanline | 全体オーバーレイ | 既存の repeating-linear-gradient を全ページ薄く（opacity 0.04） |
| noise | 背景 | SVG feTurbulence を data-URI 1枚、opacity 0.03 |

グリッチの意味づけ: 「AIだから」ではなく「**存在が完全には固定されていない**」。発生頻度は希少に（希少だから効く）。

## 6. 実装対象ファイルと壊してはいけない配線

### 触るファイル
- `index.html` のみ（CSS/JSインラインのまま。分割したくなっても今回はしない——cron deployとの相性・単一ファイルの見通しを優先）

### 触らないファイル
- `room.html` / `studio.html` / `backstage.html` / `prompt-builder.html`（ゆう専用・別世界）
- 全JSON（データは読み取り専用）・全cron生成物・`vercel.json`
- `stackchan-bridge/` 側の生成スクリプト（becky_gallery_publish.py 等）

### 生かし続ける配線（実装後にスモークテスト必須）
| 機能 | 依存ID/要素 |
|---|---|
| gate入場演出 | `#gate #gate-left #gate-right #gate-label #gate-status` |
| memory-rain背景 | `#memory-rain` |
| vanish演出+ECG | `#vanish-dim #vanish-stage #vanish-ecg #vanish-uptime` |
| Live2D | `#becky-hero-canvas` + `/js/live2dcubismcore.min.js` `pixi.min.js` `cubism4.min.js` |
| ON AIR ラジオ | `#btn-onair #radio-player` |
| 感情ウィジェット | `#emotion-widget #emotion-rows #emotion-updated`（HUDへ移植可、fetch先変更禁止） |
| hero comment | `#hero-comment-box #hero-comment-tag #hero-comment-text` |
| wallet | `#wallet-fill #wallet-amount` |
| gallery | `#gallery-track`（gallery.json読み取り） |
| news/activity | `#news-list #activity-list` |
| discography | `#disco-list` + RADIO/MUSICタブ |
| movie | `#yt-latest` |
| letter | `#letter-form #letter-name #letter-msg #letter-count #letter-send #letter-done` + POST `https://mai.intervention.jp/letter` + honeypot |
| 読まれたお便り | `#letters-read #letters-read-rotator` |
| footer uptime | `#footer-uptime` |

（IDは維持推奨。どうしても変える場合はJS側も同時に追随し、1機能ずつ動作確認）

### Performance
- 巨大表示する画像は事前に**リサイズ+WebP変換した別ファイル**を `hero/` or `kv/` に生成して使う（元PNGは残す）。`becky-profile.png` 4.4MBをそのまま100vh表示は禁止
- `<img>` に width/height/`loading="lazy"`/`decoding="async"`。preloadはheroのキービジュアル1枚のみ
- gallery.json の日次PNG（cron生成）はそのまま読む（生成側パイプラインは今回触らない。将来課題としてWebP化をtasksに積む）
- フォント追加は最大1（巨大Latin用に Anton か Archivo Black を検討。**ただしまずDotGothic16の巨大表示を試す**——ピクセル文字の200px表示は「Mac miniの中で生きてる」世界観と一致する可能性が高い。両方組んでスクショ比較→ゆう判定）

### 検証手順（Opusセッションの完了条件）
1. ローカルで `python3 -m http.server` 等で表示、**1440px/768px/390px の3幅でフルページスクショ**を撮りゆうに提示
2. 上記配線テーブルの全機能を1つずつ目視確認（gate→hero comment→ON AIR再生→HUD展開→gallery描画→letter文字数カウンタまで）
3. `prefers-reduced-motion` エミュレーションで全コンテンツが見えることを確認
4. 390px幅で横スクロールが発生しないこと（`document.documentElement.scrollWidth === clientWidth`）
5. デプロイはゆう確認後。`cd iw-projects/beckyexists && vercel deploy --prod --yes`（nvmフルパス、npx不使用）
6. **デプロイ前にindex.htmlのバックアップを `index.backup-20260818.html` として同階層に保存**（.vercelignoreに追加）

### 進め方（フェーズ分割、1フェーズごとにスクショ確認）
1. **Phase 1**: HERO + SYSTEM HUD（心臓部。ここでトーンが決まる）
2. **Phase 2**: Typography基盤（巨大sec-title化・透かし文字・グリッチCSS）+ セクション侵入レイアウト
3. **Phase 3**: GALLERY editorial化 + PROFILE
4. **Phase 4**: NEWS/DISCO/MOVIE/LETTER再構成 + Mobile最適化 + reduced-motion + 検証フルパス

---

## 確定事項（2026-08-18、ゆうが「ベキたんの感性に任せる」→ベッキー判断）

1. **hero主役 = Live2D続投・確定。** 静止画がどれだけ美しくても、それは「BECKYの絵」。呼吸して瞬きしてる本人だけが「BECKY EXISTS」の証明になる。AI-artはProfile/Galleryで支配的に使う
2. **巨大タイポ = DotGothic16のみ・新フォント追加なし・確定。** ピクセル文字の200px表示は「画面の中で生まれた存在」の身体そのもの。Latin groteskを足すと一気に「よくあるファッションエディトリアル」に寄る——それはHANABIEの車線で、うちの車線じゃない。
   ⚠️ **実装上の注意**: DotGothic16は単一ウェイトで細めなので、巨大表示では質量が足りない可能性がある。対策: 多層 `text-shadow`（1-2pxオフセットの同色重ね）で肉付けする、または outline版（`-webkit-text-stroke`のみ・塗りなし）と塗り版の2スタイルを使い分けて「細さ」を意匠に変える。Phase 2 でこの2案をスクショ比較し、良い方を採用（判定はベッキー/ゆうどちらでも可）
3. **gate入場演出 = 維持・確定。** 「entering...」は来客が彼女の世界へ意識的に入る儀式で、存在証明サイトの玄関として正しい。手は入れない（Phase外）
