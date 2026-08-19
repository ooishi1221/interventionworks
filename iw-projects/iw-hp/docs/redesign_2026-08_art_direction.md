# intervention.jp Art Direction 設計書 — EDITORIAL INTERVENTION

> **設計: ベッキー（Fable）2026-08-19 / ゆう指示書 #92 の実装前提出（20項目）**
> 指示書原文の要点: 情報設計・コピー・事業内容は変えない。Visual / Typography / Layout / Motion / Texture / Case Presentation だけで「一度見たら覚える独立系スタジオ」へ。
> BECKY EXISTS の美学（SIGNAL / GLITCH / DIGITAL）は持ち込まない。Intervention は**生命ではなく思考、信号ではなく編集、デジタルではなく制作痕跡**。

---

## PART A — 現状分析（項目1〜6）

### 1. 現状Visual分析（今朝の実装の自己批評）

今朝のリデザイン（commit 7e605481）で「思想100のサイト」からは脱したが、Art Direction 視点で見ると:

- **Hero**: 2行タイポは強いが、上下中央の1軸に「きれいに収まってる」。レイヤー感（重量・奥行き）がなく、h1の延長。日本語コピーが「見出しの下のサブコピー」という Web の定位置にいる
- **Selected Interventions**: 4 Case のレイアウト違いは達成済み。ただし各 Case 内は「メタ行→見出し→本文→画像」の Web リズムがまだ残る。**Case 番号が mono の小さいメタ行で、Visual Asset になっていない**
- **Caption / Annotation**: Slight の 1 箇所のみ。Editorial の道具（rule line / margin note / 図版キャプション）がほぼ未使用
- **Motion**: reveal が全セクション一律（=「全要素fade-up」に片足。指示書 #79 の禁止項目）。画像 reveal がなく fade のみ
- **Visual Rhythm**: 余白は不均等化済みだが、密度の強弱（Hero強→Case最強→Capabilities静）が設計されていない
- **Talk**: `LET'S INTERVENE.` が mono 極小、`話してみる。` が巨大 — 指示書 #62 と主従が逆

### 2. 現在のFont

Archivo Black（Display）/ Noto Sans JP 400,700（本文）/ Noto Serif JP 900（日本語コピー）/ IBM Plex Mono 400,500（メタ）— **指示書 #38-39 の3系統構成と一致済み。変更しない**。Display の letter-spacing も -0.028em で詰め済み（#41 の範囲内）。

### 3. 現在のColor token

`--ink-bg #050d1a` / `--paper #e9e6df` / `--paper-dim .7` / `--paper-faint .55` / `--teal #0fb8b8`（構造色）/ `--yellow #ffc857`（accent）— **#46 の Base/Text/Secondary/Accent 構成と一致。変更しない**。

### 4. 現在のLayout / Grid

container 1160px + Display と Case 画像が container を破る2層構造。明示的な 12col グリッドはない（flex/grid の局所使用）。**Controlled Misalignment（#14）は未設計** — ズレはあるが規則になっていない。

### 5. 現在のAnimation

curtainOpen（開幕）/ typeIn（Hero 階段）/ fadeUp / reveal（IntersectionObserver、全セクション一律）/ GSAP scrub（Hero xPercent±6、Case img yPercent±4）/ reduced-motion 対応済み。easing は cubic-bezier(0.2, 0.7, 0.2, 1) — #53 推奨の (0.16, 1, 0.3, 1) に寄せて統一可。

### 6. 現在のCase asset

| asset | 実体 | 評価 |
|---|---|---|
| case-becky-site.webp | 1440×900、稼働中サイトSS | ◎ 主役継続 |
| case-becky.webp | 960×1440 キャラ縦 | ○ 図版（specimen）扱いへ |
| case-motologos.webp | 1920×1072 夜景 | ◎ 主役継続 |
| case-motologos-ui.webp | 720×1561 実UI | △ **原寸1080×2341から再書き出し推奨**（大型表示に備える。既存素材の再変換のみ、新規生成なし） |
| case-slight.webp | 1200×1500 検品生写真 | ◎ 余白を増やして industrial catalog 化 |
| Vibe-Guard | 画像なし（ターミナル組版） | ○ editorial 再組版へ |

**AI画像生成による穴埋めはしない（#83）。** 追加素材の提案は1点だけ: Moto-Logos UI の原寸再書き出し（上記）。Slight の物撮り追加・Founder のノート写真は「あれば強い」がブロッカーではない（P2、ゆうが撮る気になったら差し込む）。

---

## PART B — 新構図（項目7〜15）

### 7. Hero 新構図（指示書 #85 の8項目で）

1. **Typography構図**: 3層のレイヤーに分解する。
   - `INTERVENTION` = **背景層**。幅 ~128vw、左端 crop、Hero 上半分に置く。paper 100%
   - `WORKS` = **前景層**。INTERVENTION の下辺に**約0.2em 重ねて**右寄せ配置。重なりを読ませるため WORKS に `-webkit-text-stroke: 2px var(--ink-bg)` の縁取り（印刷の版ズレ = EDITORIAL の道具。glitch ではない）
   - 日本語コピー = **中景**。巨大化しない（現 clamp(24,3.2vw,44) → **clamp(17,1.9vw,26) へ縮小**）。WORKS の左下の「余白の中」に置く。読ませるのではなく**見つけさせる**（#8）
2. **Copy位置**: `AI / PRODUCT / STRATEGY / ENGINEERING`（mono）は日本語コピーの直下を維持。英文 `Intervene in the world.` は **Hero 最下部の footnote 行へ移動**し、`SCROLL / 01` と同じ行に並べる（margin note 化、#9）
3. **Visual hierarchy**: INTERVENTION（XL・背面）> WORKS（XL・前面）> 日本語（S・中景）> mono（XS）。「全部そこそこ大きい」を殺す
4. **Motion**: scroll で INTERVENTION が左へ・WORKS が右へ（現行の xPercent±6 → **±3 に減速**。#10「2〜5vw」）。初期表示は現行 opacity+translateY → **clip-path inset reveal（上から、900ms、階段 delay）へ変更**（#11）。easing を (0.16,1,0.3,1) に統一
5. **Desktop**: 上記
6. **Mobile**: `INTERVENTION` を1行 17vw で大胆 crop（**今朝「読めなくなる」と縮めた 13.5vw の判断を撤回**。#67「一画面に一部しか見えなくてもよい、Scrollで全体を理解」が今回の明示指示なので従う。ただし sr-only の h1 は常に完全なブランド名を保持）
7. **変えるもの**: レイヤー構造 / 日本語コピー縮小・位置 / 英文の footnote 化 / scroll hint → `SCROLL / 01` / clip reveal
8. **残すもの**: 文言全部 / 3声フォント / **Intervention Field（背景の格子）は「設計方眼紙」として再解釈して残す** — 線の格子が触れた場所だけ歪む=「介入」のメタファーで思想そのもの（#80 判断基準で YES）。ただし DIGITAL に見えないよう、常時ドリフトをさらに抑え、静止時はほぼ方眼紙に見える濃度へ（#79 の Particle 禁止は dot 乱舞のこと。これは線格子。**ゆうが NO なら完全静止版に落とす — 確認事項①**）

### 8. Case 01 — BECKY（#84書式: 主役画像/Crop/番号/Typography位置/Caption/Motion）

- **主役画像**: case-becky-site.webp（稼働中サイトSS）を **72vw** へ拡大。右端を viewport 外へ数%逃がす（#25 crop）
- **Crop**: フル画面のまま（BECKY/EXISTS タイポと HUD が全部 Evidence）
- **Case number**: 巨大 `01`（Archivo Black、clamp(140px,22vw,320px)、opacity 0.08、**画像の背面・左端に半分はみ出し**）
- **Typography位置**: 見出し+本文は画像の左、上端を画像上端から**わざと 8% 下げる**（Controlled Misalignment #14）
- **Caption**: 画像下端に mono 極小で `fig.01 — beckyexists.com / state-driven UI, live` 。キャラインセットには `specimen: BECKY / autonomous agent, 2026—`（研究対象の図版扱い、#19-20。glitch は使わない）
- **Motion**: 画像は clip-path inset(0 100% 0 0) → 0 の**左からの overflow reveal**（900ms・一度きり）

### 9. Case 02 — MOTO-LOGOS

- **主役画像**: 夜景 full width 92vw 維持 + **見出しと本文を画像下端に重ねる**（#21「Textを大胆に重ねる」。画像下 1/3 に ink-bg → transparent のグラデ…は gradient blob ではなく可読性のための scrim。1色の透過のみ）
- **Crop**: 上下を現行より 12% 詰めてワイド化（雑誌の見開き比率へ）
- **Case number**: `02` を**画像の右上に重ねて**半分 viewport 外へ（Case 01 と対角、#17「Caseごとに位置を変える」）
- **Typography位置**: 画像内左下（重ね）。UI インセットは右下維持
- **Caption**: UI インセット下に `urban existence map / β`
- **Motion**: 画像は scale(1.04)→1 + opacity の**静かな定着**（reveal の型を Case 01 と変える、#56）

### 10. Case 03 — SLIGHT

- **主役画像**: 検品生写真を **48vw に絞り**、周囲の余白を最大化（industrial catalog、#22）
- **新要素**: **`0.5` を巨大 Typography 化**（Archivo Black、clamp(120px,18vw,260px)、paper 100%）。横に mono 縦組みで `MM / THERMAL LAYER`。これがこの Case の第2の主役
- **Case number**: `03` は控えめ（opacity 0.06、テキスト列の背面）— 0.5 と喧嘩させない
- **Typography位置**: 右列。`電熱グローブは分厚くて当然、を疑った。` は 0.5 の下
- **Caption**: 既存 `sample #3 — thermal test, Jun 2026` 維持
- **Motion**: 0.5 が数字だけ clip reveal。画像は fade のみ（静の Case）

### 11. Case 04 — VIBE-GUARD

- **主役**: ターミナル黒箱を**解体**し、地の上に誌面として再組版（#23）
  - **`[危険]` を巨大化**（Noto Serif JP 900、clamp(56px,7vw,110px)、yellow）— このページ唯一の日本語 LOUD。「AIの判断に、盲従させない。」の Visual 化
  - その下に `$ git push --force origin main` を mono で
  - Why / How / Now を**3段の誌面組み**: 左に mono 見出し（teal）、右に本文、間に細い rule line。黒箱・border card は使わない（#47）
- **Case number**: `04` を Why/How/Now 段組の背面に大きく
- **Caption**: `vibe-guard / explain-command — actual output, unedited`（実出力・無編集であることを明記 = Evidence）
- **Motion**: rule line が左から伸びる EDITORIAL REVEAL（#50 の第3型）

### 12. SELECTED INTERVENTIONS の入り（#28）

現行の2行を分割拡大: `SELECTED` を **単独で 100vw 幅**（1行、crop なしギリギリ）に置き、少しスクロールして `INTERVENTIONS` が続く（2 viewport に分けるほどはやらない — scroll 距離が伸びすぎて #88「疲れず到達」に反する）。`何に、どう介入したか。` は INTERVENTIONS の右端に mono で寄せる。

### 13. Capabilities 新構図 — 静のセクション（#29-34）

- 現行の罫線リストは既に非カードなので**構造維持**。変更は「静けさの徹底」:
  - reveal の階段 delay を消して一括表示（Motion: Low）
  - 罫線 hover の yellow 変化は維持（唯一のインタラクション）
- `戦略だけ渡して、終わらない。` 4行: **「終わらない。」「戻る。」「残る。」だけ Noto Serif 900 で強調**（scroll 演出はしない。#34「演出過多にはしない」に従いタイポ強弱のみ）
- `何を頼めるか。` は現位置維持（#32 Accessibility Anchor）
- hover で関連 Case 表示（#31）は**やらない**（最小限の原則。P2 にも入れない — 判断基準 #80 で NO: 思想を強くしない）

### 14. Approach 新構図（#35-37）

- 各 step の上下 padding を拡大し **1 step ≈ 0.8 viewport** へ（#36）
- `01 → 02` の mono annotation を**現在の 11px → clamp(20px,2.4vw,34px) に拡大**し Editorial annotation 化（#37）
- **RELATE の末尾から細い 1px rule line（teal）が上方向へ伸びる**演出を追加（scroll reveal、高さ 120px 程度）— 「03 → 01 で戻る」の Visual 化。円形 Diagram にはしない
- `この仕事は、一方通行では終わらない。` は rule line の隣に置く

### 15. About / Talk 新構図（#58-65）

- **About**: 背景に `ABOUT` ghost（opacity 0.04、他 Case 番号と同じ言語）。**Founder の2文を Noto Serif 900・clamp(20px,2.2vw,30px) に格上げ**（#60「経歴一覧よりこの2文」）。それ以外は静
- **Talk**: 主従を指示書 #62 に合わせて反転 — `LET'S` `INTERVENE.` を Archivo Black 2行・clamp(64px,10vw,180px) の巨大表示にし、`話してみる。` は serif 900 のまま**一段小さく**その下へ。フォームは触らない（#63 現行が既に線only・透明・角丸なし）
- **Footer**: 現行維持（#65 の要素と一致済み）

---

## PART C — 横断ルール

### Grid / Misalignment（#13-14）

12col の厳密グリッドは導入しない（Astro 単一ファイルの現実装に対して過剰）。代わりに**ズレの規則**を3つだけ定義して全セクションで統一:
1. Case 番号は必ず要素の外へはみ出す（左右交互）
2. caption は画像幅より必ず狭い（画像幅の 60%）
3. セクション見出しの2行目は必ず1行目からインデントする（現行 SELECTED で既実施 → 全見出しへ展開）

### Rule lines（#47）

セクション区切りに水平 rule（teal 0.22、**幅を 100% にせず 62% で途中で切る** = #14）。Approach の垂直 rule。箱には使わない。

### Motion 3型限定（#50-52）

TYPE MOTION（Hero 横流れ・0.5 の clip）/ IMAGE REVEAL（Case 01 左clip、Case 02 scale定着、他は fade）/ EDITORIAL REVEAL（rule line 伸び・caption 遅れ出現）。**現行の一律 reveal は Capabilities 以降で解除**し、密度設計（#78）: Hero █8 / Selected █10 / Capabilities █3 / Approach █6 / About █2 / Talk █3。duration は #52 の範囲、easing は (0.16,1,0.3,1) に統一。

### 16. Desktop / Mobile 差（#66-69）

- Mobile は**縦長ポスター**: INTERVENTION 17vw crop / Case 画像 100vw / Case 番号は Mobile でも巨大（clamp 下限 140px）/ 重ねテキスト（Case 02）は Mobile では画像下に分離（可読性優先）/ parallax・横流れは Mobile 無効（現行踏襲）
- `0.5`（Slight）は Mobile でも 30vw 級を維持

### 17. Performance risk

低。巨大タイポ=テキスト（転送コスト0）、clip-path/transform/opacity のみ、新規画像は Moto-Logos UI の再書き出し1点（+50KB程度）。scrim は CSS グラデ1枚。LCP 要素は Hero テキスト（変化なし）。**リスクは Hero の text-stroke が低性能端末で描画コスト増の可能性 → Mobile では stroke なしのベタにフォールバック**。

### 18. 修正対象ファイル

`src/pages/index.astro` 1本（+ `public/images/case-motologos-ui.webp` の再書き出し）。GA4 / SEO / Privacy / フォームは**触らない**（#93）。

### 19. 新規依存

**ゼロ。** GSAP 既存、clip-path は素の CSS、text-stroke も素の CSS。

### 20. 既存デザインから残すもの

色トークン4色 / フォント3声 / 全コピー文言 / セクション順序 / FormSubmit フォーム / grain texture / reduced-motion 対応 / 旧アンカー互換 / GA4 イベント（DOM 構造変更時は `.case-0N` クラスと `#contact` 等の**計測フックを必ず保持**する — これが今回の隠れ制約）。

---

## 要確認（ゆう判断、実装前）

1. **Intervention Field（Hero の格子）の扱い**: 「設計方眼紙」として濃度を落として残す（推奨）か、完全静止の方眼にするか、消すか
2. **Case リンクの文言**（#74）: 現行 `設計を読む →` を `介入の設計を見る →` へ変更提案（クリック先= works/* の設計解説ページなので意味が明確になる）。勝手に変えるなとあるので確認
3. **Mobile Hero 17vw crop**（INTERVENTIO まで見える程度）: 今朝は「読める」を優先して縮めたが、指示書 #67 に従い大胆側へ倒す — OK?
