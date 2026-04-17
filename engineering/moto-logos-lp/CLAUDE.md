# Moto-Logos LP（ランディングページ）

## 概要

**公開URL:** https://moto-logos.web.app  
**目的:** クローズドβテスター募集。東京限定・先行100名。  
**状態:** β募集LP（2026-04-17 デプロイ済み）

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Vite 8 + React 19 |
| 言語 | TypeScript |
| バックエンド | Firebase Firestore（`beta_signups` コレクション） |
| ホスティング | Firebase Hosting（プロジェクト: `moto-spotter`、サイト: `moto-logos`） |
| フォント | Noto Sans JP（本文）、Inter（数値） |
| 環境変数 | `VITE_FIREBASE_*`（`.env.local`、git対象外） |

## デプロイ

```bash
npm run build && firebase deploy --only hosting --project moto-spotter
```

## ページ構成（12セクション）

| # | セクション | コンポーネント | 内容 |
|---|-----------|---------------|------|
| - | ヘッダー | `StickyCta.tsx` | 固定ヘッダー: ロゴ + LiveFeed通知 + βテスター参加ボタン |
| 1 | イントロ | `HeroIntro.tsx` | シネマティック演出「これは存在証明だ。」→ 黒幕が溶けてヒーローが現れる |
| 2 | ヒーロー | `Hero.tsx` | Ken Burns背景 + h1「俺たちはここにいる。」+ β申し込みフォーム + iPhoneモック（常時表示、黒幕の奥から出現） |
| 3 | 参加のしかた | `HowTo.tsx` | 3ステップ（メール申込→招待→足跡） |
| 4 | βテスター特権 | `BetaPerks.tsx` | 3枚カード（FIRST FOOTPRINT / DIRECT LINE / WARM UP THE MAP） |
| 5 | フィロソフィー | `Philosophy.tsx` | パララックス背景付き。車社会の地図→自分たちの地図 |
| 6 | 写真帯 | `PhotoBreak.tsx` | ライダー走行写真 +「自分のメモが誰かの安心になる。」 |
| 7 | コアバリュー | `CoreValues.tsx` | iPhoneスクショ付き交互レイアウト（FOOTPRINT / WARMTH / ALTRUISM） |
| 8 | FAQ | `Faq.tsx` | 6問アコーディオン（β向け） |
| 9 | 最終CTA | `FinalCta.tsx` | Ken Burns背景 + β申し込みフォーム |
| 10 | 運営者情報 | `About.tsx` | DEVELOPED BY WitOne Inc. |
| 11 | フッター | `Footer.tsx` | © 2026 WitOne Inc. |

## 共通コンポーネント

| コンポーネント | 用途 |
|---------------|------|
| `BetaForm.tsx` | メール入力フォーム。Firestore書き込み + 残枠リアルタイム表示 + 重複チェック |
| `IPhoneFrame.tsx` | iPhoneフレーム（Dynamic Island + サイドボタン）。Hero・CoreValuesで共用 |
| `LiveFeed.tsx` | ライダー通知ローテーション。ヘッダー内で表示 |

## カスタムフック

| フック | 用途 |
|--------|------|
| `useScrollReveal.ts` | スクロール時フェードインアニメーション（Intersection Observer） |
| `useParallax.ts` | パララックス効果（`data-parallax` 属性） |

## Firestore

- コレクション: `beta_signups`
- ドキュメント: `{ email, createdAt, source: 'lp' }`
- 定員: 100名（残枠をリアルタイム表示）

## アニメーション・演出

- **イントロ:** 「これは存在証明だ。」→ テキスト消滅 → 黒幕が1.0sで溶解 → ヒーローが奥から出現（4フェーズ: black→show→textout→reveal→done）
- **ヒーロー:** 常時表示（黒幕の背後に配置）。個別スタガーなし、黒幕の溶解が唯一のリビール
- **Ken Burns:** Hero背景・FinalCta背景のスローズーム（20-25秒周期）
- **スクロールリビール:** 下から72px浮き上がり（0.4s、cubic-bezier(0.22, 1, 0.36, 1)）。カードスタガー0.1s間隔
- **ワイプセンター:** PhotoBreak名言・Philosophy区切り線のみ中央から切り開くclip-path演出
- **パララックス:** Philosophy背景のスクロール速度差
- **モック浮遊:** Heroのiphoneが上下にフロート（4秒周期）
- **カードホバー:** BetaPerks・FAQカードのオレンジグロー + リフト
- **LiveFeed:** 3.5秒ごとにライダー通知をフェード切り替え

## 画像アセット（`public/images/`）

| ファイル | 用途 |
|---------|------|
| `hero-bg.jpg` | Hero・FinalCta背景（夜の東京 + バイク） |
| `rider-journey.jpg` | Philosophy背景（夕暮れライダー） |
| `photo-break-bike.jpg` | PhotoBreak（夜の路地 + バイク、アンバー照明） |
| `app-mockup-map.jpg` | FAQ背景（ダークマップビジュアル） |
| `logo-mark.jpg` | ロゴマーク（マップピン × タイヤ痕） |
| `app-screenshot.png` | Hero iPhoneモック（ライブフィード付き地図） |
| `ss-map.png` | CoreValues 02 WARMTH（地図全景） |
| `ss-detail.png` | CoreValues 01 FOOTPRINT（スポット詳細） |
| `ss-report.png` | CoreValues 03 ALTRUISM（記録画面） |

## デザインシステム（アプリと統一）

| トークン | 値 | 用途 |
|----------|-----|------|
| `--bg` | `#0D0D0D` | ページ背景 |
| `--surface` | `#1A1A1A` | セクション背景 |
| `--card` | `#242424` | カード・FAQ |
| `--accent` | `#FF6B00` | CTA・強調 |
| `--text` | `#F5F5F5` | 本文 |
| `--text-secondary` | `#A0A0A0` | 補助テキスト |

## トーン & メッセージング

- 読点（、）は基本不使用。リズム重視
- 呼称: タグライン「俺たちは」のみ。本文はニュートラル。「お前」「あなた」不使用
- 「報告してください」「貢献しよう」とは言わない
- 「βテスト期間中は無償」（将来のマネタイズ余地を残す）
- 機能説明より「存在の実感」を描写する
- コピーライト: WitOne Inc.
