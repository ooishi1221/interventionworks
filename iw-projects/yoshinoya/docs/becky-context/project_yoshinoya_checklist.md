---
name: yoshinoya-checklist
description: 吉野家グループ会社事務向け Webチェックリスト作成ツール（裕司の嫁の会社）
type: project
---

# yoshinoya チェックリストツール

## 基本情報

- **URL（本番）**: https://yoshinoya-two.vercel.app
- **Vehicle**: Intervention Works 直営
- **ディレクトリ**: `/Volumes/SSD2TB/interventionworks/iw-projects/yoshinoya/`
- **Vercel アカウント**: yujiooishi-8378（IW メアド）
- **対象ユーザー**: 吉野家グループ会社の事務スタッフ（ITリテラシー低め・高齢者多め）

## 完成日

2026-05-30（土）、裕司とのペアセッションで一気に完成。

## 機能一覧

| 機能 | 状態 |
|---|---|
| テンプレート選択（月次業務 / プロジェクト / 引き継ぎ / 新人受入） | ✅ |
| 空白から新規作成（ヘッダー・ヒーローの新規作成ボタン） | ✅ |
| マイテンプレート保存・再利用（雛形として保存） | ✅ |
| 行追加・削除・上下移動 | ✅ |
| 全クリア（ゴミ箱ボタン） | ✅ |
| 列設定（表示切替・カスタム列追加・削除） | ✅ |
| ドロップダウン選択肢設定（全列・ステータスも編集可） | ✅ |
| ブラウザ保存（localStorage） | ✅ |
| ダークモード（システム設定連動 + 手動切替） | ✅ |
| **Excel出力**（フォーマット3種 × カラー6色） | ✅ |
| **PDF/印刷**（フォーマット3種 × カラー6色） | ✅ |
| 出力前プレビューモーダル（Excelのみ） | ✅ |
| カラースキーム選択（blue/green/gray/red/purple/teal） | ✅ |
| Excel Data Validation（ドロップダウン）| ✅（exceljs API Route経由） |

## 出力フォーマット

| フォーマット | 説明 |
|---|---|
| スタンダード | タイトル左ボーダー＋水平線のみのクリーンな表 |
| チェックシート | カテゴリ別グループ＋記入欄あり、手書き印刷向け |
| ビジネス報告 | 会社名・承認者欄＋備考欄、提出書類向け |

## Tech Stack

- **Framework**: Next.js 16 + Tailwind v4 + TypeScript
- **Excel出力**: exceljs（API Route、サーバーサイド実行）
- **デプロイ**: Vercel（yujiooishi-8378 アカウント）
- **データ保存**: localStorage（サーバーなし）

## UXポイント（高齢者・ITリテラシー低め対策）

- 「Excel 出力」ボタンを緑色で大きく目立たせる
- 「保存」→「ブラウザに保存」、tooltip で「別PCでは引き継げません」
- 「テンプレ保存」→「雛形として保存」、tooltip で内容補足
- フォントを text-sm 基本（text-xs を極力使わない）
- テキストカラーを gray-600 以上（薄すぎない）

## craft メモ

- exceljs をブラウザで動かすのが難しく（Node.js依存）、API Route でサーバーサイド実行に切り替え
- `xlsx-js-style` は `!validations` を実際に xlsx に書き出せなかった（exceljs に移行で解決）
- Data Validationは `ws.dataValidations.add()` で動く（型定義が足りないため `as any` でキャスト）
- Tailwind v4 で `@custom-variant dark` を使ってクラスベースダークモードを実装
- Excel出力のデザイン原則: **縦線なし・水平線のみ・タイトルは左ボーダーのみ**（ベタ塗り帯廃止）

## 次のアクション候補

- 現時点で完成形として嫁さんに渡せる状態
- 将来的に: URL認証 / 複数ユーザー共有 / Supabase保存（今は不要）
