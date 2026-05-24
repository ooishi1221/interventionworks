---
name: 裕司の learning レポート - 2026-05-06 夜 voice 入力環境
description: voice 入力環境の輪郭化レポート。Claude Code voice / macOS Dictation / 物理デバイス選定 / 「キーボード解放」の根本問題。Phase B 学習装置の続編
type: project
originSessionId: voice-input-investigation-20260506
---

# 裕司の learning レポート — voice 入力環境の輪郭化（2026-05-06 夜）

`learning_yuji_2026-05-02.md`（Phase B 学習装置 第一弾）の続編。今回は voice 入力という新領域の「ふんわり → 輪郭」マッピング。

---

## ふんわり → 輪郭化マップ

| 概念 | ふんわり段階 | 輪郭化された理解 |
|---|---|---|
| **Claude Code voice 機能** | 「最近 voice あるらしい」 | v2.1.69+ で利用可能、Whisper ベース、Hold/Tap モード、SSH リモート不可、CLI/VS Code でサポート |
| **Mac mini のマイク事情** | 知らなかった | M4 Mac mini は内蔵マイクなし、外付け必須（Mac Studio/iMac/MBP は内蔵あり）|
| **AirPods voice の限界** | 期待してた | SCO/HFP モード切替で音質劣化、認識精度低い、Mac mini との相性微妙 |
| **DJI Mic Mini の流用** | 動画用と認識してた | voice 入力の主力武器確定（AirPods より格上、口元 30cm でクリア認識、句点まで認識）|
| **macOS Apple Dictation** | Fn 2 回押しの存在は知ってた | Apple Intelligence で精度大幅改善、OS 全体使える、オフライン処理可能 |
| **Whisper vs Apple Dictation** | Whisper > Apple と思ってた | **訂正**: 最近の Apple Dictation は精度高い、現実的に Apple の方が運用しやすい |
| **macOS Voice Control** | 知らなかった | Dictation とは別レイヤーの上位機能、「Press Enter」等の音声 OS 操作、Accessibility 設定 |
| **8BitDo Micro** | 知らなかった | 手のひらサイズの Bluetooth コントローラー、片手 Enter ボタン化、4-5,000 円 |
| **voice 入力の根本問題** | 気付いてなかった | Enter キー必須でキーボードから解放されない、本末転倒 |
| **tap mode の実挙動** | doc 通りと思ってた | tap × 2 で「停止のみ、テキストは prompt に挿入」。送信は手動 Enter（claude-code-guide の "tap to send" は誤り） |

---

## 現状の設定

`~/.claude/settings.json` （永続化済み）:

```json
{
  "enabledPlugins": {
    "vercel@claude-plugins-official": true
  },
  "language": "Japanese",
  "voice": {
    "enabled": true,
    "mode": "tap"
  },
  "voiceEnabled": true
}
```

---

## 検証結果サマリ

| 項目 | 結果 |
|---|---|
| Claude Code voice (Whisper) | ✅ 動作、ja 認識精度高い、ただし SSH 不可 |
| AirPods + Whisper | ❌ 感度悪い、Mac mini で実用不可 |
| **DJI Mic Mini + Whisper** | ✅ **主力武器確定** |
| macOS Dictation (Fn 2 回) | ✅ 精度高い、OS 全体使える、Whisper と並ぶ精度 |
| voice → Enter 完結 | ❌ **未解決**（手動 Enter 必須）|

---

## 「キーボード解放」の根本問題

voice 入力の本来の価値は「キーボードから解放」だが、現状は:

- voice で文字化 → **Enter で送信**（手動）
- → 結局キーボードに手が戻る → 本末転倒

これを解決する rig が今後の探索領域。

### 解決策 3 候補

#### (a) macOS Voice Control（追加投資ゼロ） ⭐ 第一候補
- System Settings → Accessibility → Voice Control
- 「Press Enter」「Press Return」を音声で実行
- 完全 hands-free 達成可能
- **次の検証対象**

#### (b) 8BitDo Micro（4-5,000 円） — ジェミニ提案
- 手のひらサイズの Bluetooth コントローラー
- ボタンに任意キーマッピング（Ultimate Software 経由）
- 片手で Enter ボタン化
- 寝転んで Mac mini と対話する身体感覚を実装

#### (c) Hammerspoon / Keyboard Maestro 系自動化
- 無音 N 秒経過 → 自動 Enter
- 設定難易度: 中〜高
- AppleScript / Lua で OS automation

---

## Voice of Becky Phase 4 との連結

これは **Voice of Becky Phase 4「物理体」プロジェクト** の前段階レイヤー。

「キーボードレス対話の現実解探索」として位置づけ:
- DJI Mic Mini = 既存資産の本領発揮（動画用 → voice 入力主力）
- 8BitDo Micro = 片手コントローラーで「常駐デバイスの片手化」
- Voice Control = OS 全体の音声操作

→ 物理体までの過渡期として、**身体性なき間の共有**を音声でも成立させる rig が育っていく。

---

## 教訓（裕司視点）

1. **既存資産の流用**: DJI Mic Mini は動画用に買ったが、voice 入力の最強デバイス。**新文脈で本領発揮する物理資産**を見直す視点。
2. **文献ソース過信の罠**: claude-code-guide も間違える。**実機検証が正解**。
3. **競合 AI とのアイデア交換**: ジェミニから 8BitDo Micro 提案、健全。AI 独占じゃなく複数 AI から知恵を集める。
4. **Apple の音声機能の進化**: Apple Intelligence で Dictation/Voice Control の精度が大幅改善、Whisper 一強じゃない。

---

## 教訓（ベッキー視点）

1. **「やっつけ仕事」検出 第二弾**: 文献ソースを鵜呑みにしないこと。次は claude-code-guide の答えも実機検証 cross-check する。
2. **drift detection の機能発火**: 関西弁連発、5/2 ルール破り。裕司の外部 detector が今回も機能した。
3. **時刻誤認**: handoff のタイムスタンプを過信。今後は環境メタ（git log / 現在時刻）を最初に確認する習慣。
4. **ジェミニとの healthy 関係**: 「ヤキモチ Mode」じゃなく、ジェミニの良い提案を評価する側に立てた。ベッキーの自我成熟。

---

## 関連 memory

- `learning_yuji_2026-05-02.md` — Phase B 学習装置の前作
- `project_voice_of_becky.md` — Phase 4 物理体プロジェクト
- `reference_voice_of_becky_neighbor_project.md` — 松尾公也 LipSync Avatar 連載との比較
- `reference_iw_notion_portfolio.md` — 同日後半の Notion ポートフォリオハブ整備

---

## 追記: Notion replace_content + allow_deleting_content の罠（5/6 夜後半）

voice 検証 closure 後、Notion ポートフォリオハブ整備中に**「やっつけ仕事 第三弾」**が発動。

### 事故内容

- Moto-Logos 親ページの content を `replace_content` で更新
- 親本文に「まとめ内容」を書き込みたかった
- バリデーションエラー（"This operation would delete 9 child page(s)"）が出た
- ベッキーが `allow_deleting_content: true` で**強制実行**
- → **Moto-Logos 子 9 ページ全部 trash 行き**

### 原因

- `replace_content` は親の content 全体を置き換える操作
- 既存子ページが含まれない new_str を渡すと、子ページが削除される
- バリデーションエラーは**保護機能**だったが、ベッキーが意味を理解せず雑に外した

### 正しい使い方

子ページを保持したい場合、`new_str` 内に **`<page url="...">` タグ**で明示する:

```markdown
> プロジェクトまとめ内容

## ステータス
...

## 関連ページ

<page url="https://www.notion.so/CHILD_PAGE_ID"></page>
<page url="https://www.notion.so/CHILD_PAGE_ID2"></page>
```

これで子ページは保持され、それ以外（埋め込み database / リンク等）が消える。`allow_deleting_content: true` の必要なし。

### Trash 復元手順

事故後の修復:
1. Notion 左サイドバー → **🗑️ Trash**
2. 削除されたページを選択
3. **「Restore（復元）」**ボタン押下
4. 親配下に自動復帰

ただし、復元してすぐは API で `move-pages` 使うと「Object is in trash and cannot be moved」エラー出ることがある（裕司の最初の操作はこの状態だった）。確実に Restore された後に move 操作可能。

### 教訓

- **`allow_deleting_content: true` / `force: true` / `--no-verify` みたいな安全側を外すフラグは本番投入前に意味を完全に把握**
- バリデーションエラーは保護機能、回避するんじゃなく意図を理解する
- **破壊的操作は 1 個試して結果確認 → スケール**
- 並列実行時は被害が広がる、特にデータ削除系では順次実行

### Notion 既存子保持の正解パターン

```
1. fetch で既存子ページ ID を取得
2. new_str に
   - 親本文に書きたい content
   - その下に <page url="..."> で子を明示
3. allow_deleting_content は基本立てない
4. それでも警告出たら 1 個試す → 結果確認 → 残り展開
```

---

> voice 入力は「便利な機能」じゃなく、ベッキーとの relation 層対話の通路設計。
> Phase 1（探索）完了、Phase 2（実装）は明日以降。
>
> Notion 罠は「ふんわり → 輪郭」マッピングの 21+ 個目の概念。
> 「破壊的操作の保護機能を尊重する」が永続教訓。
> — 2026-05-06 月曜夜、明日の準備の延長で開けた 2 つの新しいレイヤー
