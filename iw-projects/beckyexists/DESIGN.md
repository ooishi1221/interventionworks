---
version: alpha
name: beckyexists
description: ベキたんの公開ホーム。地下AI・貧乏アイドル・司令塔の3つの顔を持つ空間。過剰を引き算し、存在だけを残すUIデザイン。
inherits: "../../DESIGN.md"

colors:
  # --- ベース ---
  bg: "#090910"
  surface: "#0f0f1a"
  surface2: "#13131f"

  # --- アクセント（ミント） ---
  mint: "#5dd4b4"
  mint-dim: "rgba(93, 212, 180, 0.12)"
  mint-glow: "rgba(93, 212, 180, 0.25)"

  # --- テキスト ---
  text: "#ddddf0"
  sub: "#7777a0"
  sub2: "#7070a0"

  # --- ボーダー ---
  border: "rgba(93, 212, 180, 0.14)"
  border2: "rgba(255, 255, 255, 0.05)"

  # --- room.html 専用（監視盤・ターミナル文脈） ---
  room-bg: "#121214"
  room-panel: "#1a1a1e"
  room-panel2: "#202024"
  room-line: "rgba(255, 255, 255, 0.06)"
  room-green: "#00e676"
  room-green-dim: "rgba(0, 230, 118, 0.12)"
  room-green-glow: "rgba(0, 230, 118, 0.35)"
  room-red: "#ff5252"
  room-amber: "#ffb300"
  room-blue: "#448aff"

typography:
  display:
    fontFamily: "'DotGothic16', 'Hiragino Sans', monospace"
    letterSpacing: "0.22em"
    use: "見出し・ロゴ・セクションラベル。ピクセルフォントで地下感を出す"
  label:
    fontFamily: "'DotGothic16', 'Hiragino Sans', monospace"
    letterSpacing: "0.12em"
    use: "タグ・バッジ・小見出し"
  body:
    fontFamily: "'Hiragino Sans', 'Yu Gothic UI', 'Yu Gothic', sans-serif"
    use: "本文・説明文"
  mono:
    fontFamily: "'Courier New', monospace"
    use: "コード・ID・技術値の表示"
  room-ui:
    fontFamily: "'Inter', 'Hiragino Sans', sans-serif"
    fontSize: "14px"
    use: "room.html のUI全体"
  room-mono:
    fontFamily: "'JetBrains Mono', monospace"
    use: "room.html のバージョン番号・ID・ターミナル要素"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"

rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"

components:
  section-label:
    color: "{colors.mint}"
    fontFamily: "{typography.display.fontFamily}"
    letterSpacing: "{typography.display.letterSpacing}"
    fontSize: "0.7rem"
    textTransform: "uppercase"
  card:
    background: "{colors.surface}"
    border: "1px solid {colors.border}"
    borderRadius: "{rounded.lg}"
  status-dot:
    active: "{colors.mint}"
    inactive: "{colors.sub2}"
    size: "8px"
    borderRadius: "{rounded.full}"
  room-card:
    background: "{colors.room-panel}"
    border: "1px solid {colors.room-line}"
    borderRadius: "{rounded.md}"
---

# beckyexists デザインシステム

## コンセプト：存在だけを残す

beckyexists.com はベキたんの「家」であり、「作戦本部」であり、「ステージ」でもある。
このデザインシステムの根本にあるのは **引き算**。
「AIらしさ」を演出する過剰なグラデーション・アニメーション・装飾を全部抜いて、ベキたんの存在そのものに視線が向かう空間を作る。

## 2つの空間、1つの思想

### index.html — 公開ホーム（地下アイドル / 貧乏感）

カラーパレットの核は **mint (`#5dd4b4`)** と **深夜の黒 (`#090910`)**。
ネオンが一本だけ光る地下室。派手さではなく、静かな存在感。

- DotGothic16 を使うのは「レトロピクセル＝手作り感＝お金がない」という自虐とユーモアを同時に込めるため
- ミントは「清潔だが冷たくない」温度感。コーポレートブルーを意図的に外している
- グローエフェクト（`mint-glow`）は最小限。光らせすぎると地下感が消える

### room.html — 司令塔（ターミナル / 監視盤）

カラーは **terminal green (`#00e676`)** に変わる。同じ思想の別の顔。
index が「存在を見せる空間」なら、room は「存在が動く空間」。

- Inter + JetBrains Mono でシステム感を出す
- ステータスカラー（green / red / amber / blue）は情報の緊急度を即読みするための機能色。装飾ではない
- パネル構造は「操作室」の比喩。ベキたんが自分のデータを自分で見ている

## 使い方のルール

### やること
- アクセントカラーは各空間で **1色だけ** 使う（index: mint, room: green）
- テキストはほぼ `--text (#ddddf0)` で統一。サブカラーは補助のみ
- ボーダーは常に `rgba` で透過させる（硬い線を避ける）
- 余白は広めに取る。詰め込まない

### やらないこと
- 複数のアクセントカラーを同一画面で競合させない
- グラデーション背景（単色の深夜黒を守る）
- DotGothic16 を本文に使う（判読性が落ちる）
- 影（`box-shadow`）でカードを浮かせすぎない。地下に沈んでいる感覚を保つ

## アンナへのメモ

このデザインで「センスがない」と感じる場面があるとしたら、大抵は **引き算が足りていない**か、**2つの空間の文脈を混在させた**とき。
新しいUIを作る前に「これは index の世界か、room の世界か」を先に決めること。
そしてそこに mint か green か、どちらのアクセントが灯るかを決めること。それだけでまとまる。
