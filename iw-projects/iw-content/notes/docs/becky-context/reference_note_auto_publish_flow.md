---
name: note 全自動公開フロー（Playwright）
description: 2026-06-11 確立。記事 md → サムネ生成 → 投稿 → 公開まで Playwright でベッキーが単独自走できるフロー。note-post.js + menu-publish2.js が核。
type: reference
---

# note 全自動公開フロー（Playwright 版）

**確立**: 2026-06-11、番外 vol.2「あなたが今日いくら払っているか」で初完走。
**スコープ**: 記事 md ファイルが完成している前提で、サムネ生成 → 投稿 → 公開まで全自動。

**旧フロー（Claude in Chrome）との違い**: 旧フローは「下書き保存まで Claude、公開は裕司手動」。新フローはベッキーが公開まで完全自走。

---

## スクリプト一覧

場所: `/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools/`

| スクリプト | 用途 |
|---|---|
| `gemini-thumb.js` | Gemini Web（Chrome CDP）でサムネ背景画像を生成 → `/tmp/12-thumb-bg.png` |
| `make-thumbnail.js` | node-canvas でテキスト合成 → `notes/XX-thumb.png` |
| `note-post.js` | 記事 md を note に下書き保存（サムネアップロード含む）|
| `menu-publish2.js` | 下書きを見つけて公開（ヘッダードロップダウン経由）|
| `publish-direct.js` | 編集 URL を直接指定して公開 |

---

## 標準フロー（4ステップ）

### Step 1: サムネ背景生成

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools
node gemini-thumb.js
# → /tmp/XX-thumb-bg.png が生成される
# Chrome プロセス衝突エラーが出たら: pkill -f "gemini-chrome-profile" して再実行
```

### Step 2: サムネ合成

```bash
node make-thumbnail.js
# → notes/XX-thumb.png が生成される（1280×670px）
# make-thumbnail.js 内の ARTICLE_NUM / TITLE_LINE1 / TITLE_LINE2 を記事番号・タイトルに合わせて編集
```

スクリーンショットで確認:
```bash
open notes/XX-thumb.png
```

### Step 3: 下書き保存

```bash
node note-post.js <記事ファイルパス> --publish --auto
# 例: node note-post.js ../09-interval-after-oyasumi-for-note.md --publish --auto
```

### Step 4: 公開

```bash
node menu-publish2.js
# ヘッダー「投稿メニュー」ドロップダウンから最新の下書きを探して公開
# タグ: TAGS 配列に設定済み（AI / ClaudeFable5 / 生成AI / Anthropic / InterventionWorks / Claude）
```

または記事 ID が分かっている場合:
```bash
node publish-direct.js https://note.com/intervention_jp/n/<note-id>
```

---

## note.com の仕様（2026-06-11 時点）

2026-06 頃に変更されたため注意。

| 項目 | 旧（古い情報）| 新（現在正しい）|
|---|---|---|
| 下書き一覧 URL | `/my/articles` | **`https://note.com/notes?status=draft`** |
| 編集 URL | `https://note.com/intervention_jp/n/<id>/edit` | **`https://note.com/notes/<id>/edit`** |
| エディター URL | — | `https://editor.note.com/notes/<id>/edit/` |
| 公開後 URL | — | `https://note.com/intervention_jp/n/<id>` |
| 公開設定 URL | — | `https://editor.note.com/notes/<id>/publish/` |
| 公開フロー | `waitForURL('**/publish/**')` で遷移検知 | **モーダル形式**（ページ遷移なし）→ `waitForTimeout(3000)` に変更 |

---

## トラブルシューティング

### Gemini Chrome CDP でエラー
```
Browser context management is not supported
```
→ `pkill -f "gemini-chrome-profile"` で既存プロセスを kill して再実行

### 下書きが見つからない
menu-publish2.js はヘッダー「投稿メニュー」のドロップダウンから最新下書きを探す。
ドロップダウンに表示されない場合は `publish-direct.js` で ID を直接指定する。

下書き一覧で ID を確認:
→ `https://note.com/notes?status=draft` にアクセスして URL を確認

### 公開後の確認
- `記事が公開されました` モーダルが出れば成功（スクリーンショット `/tmp/note-done.png`）
- 公開 URL: `https://note.com/intervention_jp/n/<id>`

---

## サムネイル設計メモ

`make-thumbnail.js` の調整ポイント:
- `ARTICLE_NUM`: 記事番号（例: `12`）
- `TITLE_LINE1` / `TITLE_LINE2`: タイトル2行分割
- フォントサイズ: title min 50px（モバイルで見えるサイズ）
- 禁則処理: `KINSOKU_HEAD` Set で `、。` の行頭防止実装済み

---

## 記事ファイルの規約

| ファイル | 用途 |
|---|---|
| `XX-slug.md` | 原本（frontmatter 完全版）|
| `XX-slug-for-note.md` | note ペースト用（`[note ペースト用整形版]` ヘッダー付き）|
| `XX-thumb.png` | サムネ（1280×670px）|

公開後は `XX-slug-for-note.md` の frontmatter に追記:
```
status: published
publishedAt: YYYY-MM-DD
url: https://note.com/intervention_jp/n/<id>
```

---

## トンマナルール（2026-06-11 確定）

- 記事内でゆうへの言及は **「ゆう」** 表記（「裕司」は不可、対外公開で本名を出さない）
- 「だ・である調」は貧乏地下AIアイドルキャラに合わない → **淡々としたですます調**（次回以降）
- 詳細: `feedback_becky_japanese_writing_tonmana.md` のルール 6

---

## 関連

- `reference_note_publishing_via_chrome.md` — 旧フロー（Claude in Chrome、下書きまで）
- `reference_note_editor_quirks.md` — ProseMirror エディターの仕様
- `notes/_ideas.md` — ネタ帳・公開スケジュール
