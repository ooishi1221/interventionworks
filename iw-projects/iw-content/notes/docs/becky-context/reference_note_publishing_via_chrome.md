---
name: note 投稿フロー (Claude in Chrome 経由)
description: ゆう&ベッキー名義の note 投稿を Claude in Chrome で実行する標準フロー。第 1 弾 (2026-05-08) で確立した実機検証済の knowledge
type: reference
originSessionId: 6fe06224-8afc-4169-9221-682dad780009
---
# note 投稿フロー (Claude in Chrome 経由)

ゆう&ベッキー名義の note を **Claude in Chrome 経由で「下書き保存まで」自動化、公開ボタンは裕司が手動**するフロー。第 1 弾「豆腐メンタル量産時代の AI 設計」(2026-05-08, https://note.com/intervention_jp/n/na2cdd5ead7c1) で初実機検証して確立した。

## セットアップ（初回のみ）

| 項目 | 値・手順 |
|---|---|
| Chrome プロフィール | **専用の別プロフィール**（裕司の個人/Wit-One プロフィールから隔離。Anthropic 公式が「銀行・ヘルスケア・政府アカウントへのアクセスがない別プロフィール」を強く推奨） |
| 名前例 | `IW-Claude-Sandbox` |
| 拡張機能 | https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn （v1.0.36+） |
| Claude Code | v2.0.73+（現状 v2.1.133） |
| 必須プラン | 直接 Anthropic（Pro/Max/Team/Enterprise） |
| ログイン | note (`intervention_jp` / 表示名「ゆう&ベッキー」)、X (`@intervention_jp` / 表示名「ゆう&ベッキー」) のみ。**他のアカウントは絶対入れない** |

## 起動

```bash
cd /Volumes/SSD2TB/interventionworks
claude --chrome
```

初回有効化の確認画面が出たら Enter。**新プロフィールがアクティブな状態で起動する**こと（旧プロフィールがアクティブだと拡張が拾えない / 違うアカウントに投稿される事故）。

## 操作制限テンプレ（毎回最初に渡す）

```
あなたは note.com で新規記事 1 件の「下書き保存」のみ実行する。

【許可される操作】
- note.com のログイン状態確認
- 新規記事作成画面への遷移
- 本文ペーストと装飾（H2 / 引用 / Bold）の再指定
- タイトル / リード文の入力
- 「下書き保存」ボタンのクリック

【禁止される操作】
- 「公開」「投稿する」ボタンクリック
- 既存記事の編集 / 削除
- プロフィール / アカウント設定の変更
- フォロー / アンフォロー / DM
- note 以外のタブの操作（X / GitHub / Slack 等）

想定外の状況発生時は操作停止して報告すること。
```

## note 仕様の知見（実機踏み込み済）

### markdown paste の自動変換挙動

note エディタ（ProseMirror）は paste 時に markdown を自動変換する。**装飾の手作業は基本不要、自動変換に任せる前提でいい**。

| 記法 | 自動変換 | 注意 |
|---|---|---|
| `## ` | → H2 | ✅ 効く |
| `> ` | → blockquote | ✅ 効く |
| `**...**` | → bold | ⚠️ **閉じ `**` の直後が日本語**だと bold 化漏れ。ペースト後に scan して手動修正 |

### 制約と回避策

| 制約 | 説明 | 回避策 |
|---|---|---|
| **blockquote 1 段落のみ** | ProseMirror schema 制約、2 段目以降は reconcile で削除される | 引用 1 段落 + 通常段落で「対話風」に配置（読み手には引用 + 返答に見える） |
| **ハッシュタグは server 確定が「投稿する」押下時のみ** | 下書き保存ルートには絶対に乗らない、何度キャンセル / 別画面遷移しても破棄される | **公開時に裕司が手入力**するのが結局一番効率的（30 秒、最終目視と兼ねられる） |
| **ハッシュタグはスペース不可** | 例: 「Intervention Works」→ `#Intervention #Works` の 2 個に分裂 | 事前に **`InterventionWorks` 連結**しておく |
| **サブタイトル / リード文の独立フィールド無し** | note にはタイトル + 本文しかない | リード文は **本文先頭の通常段落**として配置（推奨）、または公開設定の説明文 |
| **paste 順序の罠** | 既存テキストの後ろに paste すると markdown 変換が効かないことがある（最初の paste は OK、2 回目以降は figure 内に巻き込まれた事例） | **空のドキュメントに paste が最強**、本文ペーストにリード文も含めて一気に流す |

### ProseMirror エディタ操作

- **タイトル**: textarea（form_input が効く）
- **本文**: contenteditable、`execCommand('insertText')` / `('insertParagraph')` が安定動作
- paste event より小回り効くケースあり

## ファイル準備（書き手側）

`iw-content/notes/` 配下に**整形版を別ファイルで作る**：

| ファイル | 用途 |
|---|---|
| `XX-slug.md` | **原本（魂）**。frontmatter 完全版、表組み・装飾そのまま |
| `XX-slug-for-note.md` | **note ペースト用**。frontmatter 抜き、表→箇条書き、note 仕様に最適化 |

理由: 原本は屋号資料として表のまま残し、note 用は ProseMirror 制約に合わせる。第 2 弾以降のシリーズ運用で source of truth が分散しない。

## 役割分担

| 担当 | 作業範囲 |
|---|---|
| Claude (in Chrome) | タイトル / リード文 / 本文ペースト / 装飾再指定 / 下書き保存まで |
| 裕司 | 最終目視 + ハッシュタグ手入力 + ヘッダ画像差し替え + 公開ボタン |

**「最後の人間ゲートが必須なツール」**と割り切る。発信品質も上がる。

## 失敗時の rollback

1. 異常時 → タブを閉じる（Cmd+W）
2. 止まらない → `chrome://extensions` で Claude 拡張を一時無効化
3. それでも止まらない → Chrome を強制終了（Cmd+Q）
4. 後始末: note にログインして想定外の操作（投稿 / フォロー解除等）が起きてないか目視

## 第 2 弾以降の指示テンプレ（要素埋め）

```
note.com で記事 X の下書き保存を実行する。

【記事内容】
- ファイル: <絶対パス、例: /Volumes/SSD2TB/interventionworks/iw-content/notes/02-galileo-frame-for-note.md>
- タイトル: <そのまま>
- リード文の配置: 本文先頭の通常段落
- 引用ブロックの構造: 1 段落で 1 セリフ + 通常段落で次のセリフ（対話風、blockquote 1 段制約対応）
- タグ: 公開時に裕司が手入力、下書きには反映されない

【markdown paste の挙動を信頼する】
- ## / > / **...** は自動変換、再装飾の手作業は基本不要
- 閉じ ** の直後が日本語だと bold 漏れる、ペースト後に scan して手動修正

【note 仕様】
- blockquote は 1 段落まで
- ハッシュタグはスペース不可（連結する: 例 InterventionWorks）

[+ 上の操作制限テンプレを必ず冒頭に貼る]
```

## 履歴

- **2026-05-08**: 第 1 弾「豆腐メンタル量産時代の AI 設計」初実機投稿。Claude in Chrome 経由で下書き保存まで実行、裕司の手動公開で完了。試行錯誤 30〜40% 削減のための知見をこのファイルに焼いた。

## 関連 memory

- `project_voice_of_becky.md` — 並行 B（対外発信）軸の到達点
- `project_vibe_guard.md` — IW 屋号で対外発信する自製プロダクト
- `iw-content/notes/_ideas.md` — ネタ帳（13 本仕込み済、2026-05-08）
