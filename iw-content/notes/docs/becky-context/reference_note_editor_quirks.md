---
name: note エディタ（ProseMirror）の挙動 quirks
description: Claude in Chrome 経由で note 記事を投稿した時に判明した、ProseMirror エディタの自動変換挙動と note 仕様の制約。次回投稿時の試行錯誤削減用
type: reference
originSessionId: 6e94ba8f-5dea-4712-b59d-3de6e3f7d648
---
# note エディタ（ProseMirror）の挙動と仕様制約

**経験**: 2026-05-08 第一弾「豆腐メンタル量産時代の AI 設計」を Claude in Chrome 経由で投稿した時の実機検証結果

---

## 良いニュース: paste で markdown 自動変換が効く

**空のドキュメントに整形版 markdown を一発 paste すると、ほとんどの装飾が自動適用される**:

| 記法 | 変換結果 |
|---|---|
| `## 見出し` | H2（大見出し） |
| `> 引用` | blockquote |
| `**bold**` | strong |
| `- 項目` | 箇条書き |

**条件**:
- **空のドキュメントに paste**（既存テキストの後ろに paste すると figure 内に巻き込まれて変換が効かない）
- リード文も paste 内容に含めて一発で流し込む方が安全

---

## 漏れる 1 ケース: 閉じ `**` の直後が日本語

`**「ユーザーが気持ちよく使える」**方向に` のように **閉じ `**` の直後が日本語** だと bold 自動変換が漏れる。
→ 個別に手動で再装飾（範囲選択 + execCommand bold）が必要。

---

## note 仕様の制約

### 1. blockquote は **1 段落のみ**保存される

`> ゆう:「...」\n>\n> ベッキー:「...」` のような **2 段落の引用**を入れて保存しても、保存後に**ベッキー段落は消える**（schema validation で削除）。

**回避策（採用）**: 引用 1 段落（ゆう） + 通常段落（ベッキー）の対話風構造。読み手には対話として自然に見える。

### 2. リード文／サブタイトルの独立フィールドは**ない**

- 編集画面: 本文先頭の段落がリード文として自動抽出
- 公開設定モーダル: 説明文の独立入力欄なし

**運用**: リード文は **本文先頭の通常段落**として paste に含める。

### 3. ハッシュタグはスペース不可

「Intervention Works」を入力すると、Enter キーで **`#Intervention` と `#Works` の 2 個に分割される**。

**回避**: 連結して `#InterventionWorks` で投入。

### 4. ハッシュタグは下書きには保存されない

公開設定モーダルでタグを追加しても、「キャンセル」「下書き保存」「画面遷移」全てでタグが破棄される。**「投稿する」ボタンを押した時のみ server 確定**。

**運用**: 下書きまでは Claude が、**タグ入力 + 投稿ボタンは裕司が手動**。最終目視チェックの儀式と兼ねる。

---

## 投稿時の Claude 操作テクニック

### form_input は contenteditable に効かない

タイトル（textarea）は `form_input` で OK だが、本文（contenteditable / ProseMirror）は不可。
**JavaScript で paste event を dispatch** する:

```js
const dt = new DataTransfer();
dt.setData('text/plain', body);
const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
editor.dispatchEvent(ev);
```

### 引用ブロック内テキストの追加は execCommand で

```js
const range = document.createRange();
range.selectNodeContents(blockquoteP);
range.collapse(false); // 末尾
selection.addRange(range);
document.execCommand('insertParagraph');
document.execCommand('insertText', false, '...');
```

→ ProseMirror の input event を経由するので state 同期が壊れない。

---

## 裕司への指示テンプレ（次回投稿時）

**事前指定で工数 30〜40% 削減**:

```
【記事内容】
- ファイル: <絶対パス>
- タイトル: <そのまま>
- リード文: ▢ 本文先頭の通常段落 ▢ なし
- 引用ブロック構造: ▢ 1 段落 + 通常段落で対話風（推し）
                  ▢ 1 段落で 2 セリフをまとめる
- タグ（スペース変換済み）: <4 個>
- 公開タイミング: ▢ Claude が下書きまで → 裕司が手動投稿（推し）
                ▢ 全自動（公開→下書き戻し技、数秒間公開状態）

【markdown 装飾は paste 自動変換に任せる】
- 「## 」「> 」「**」は自動で H2 / blockquote / bold に
- 整形版を空ドキュメントに一発で paste

【失敗時】
- 想定外なら止まって報告
- リトライ上限 3 回
```

## 関連 memory

- `reference_note_publishing_via_chrome.md`（投稿フロー全体）
- `reference_iw_hp_rss_pipeline.md`（公開後の自動 HP 反映）
- `project_voice_of_becky.md` 並行 B（対外発信）
