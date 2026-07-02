---
name: image-gen-web-gemini
description: 画像生成の基本フローは Web Gemini（CLI/API じゃなく）→ Gemini マーク消し。2026-07-03 ゆう発ルール
metadata:
  type: reference
---

# 画像生成は Web Gemini が基本（2026-07-03 ルール化）

裕司「CLIで画像生成するとAPI使う割にイマイチなケースが多かったから、Webのジェミニで生成→ジェミニマーク消す、にした。画像生成するときは基本これにしてほしい」

## 基本フロー

1. **生成**: `gemini-thumb.js`（Chrome CDP で Web 版 Gemini に接続）
   ```bash
   cd /Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools
   node gemini-thumb.js "英語プロンプト" --out /tmp/bg.png [--ref /path/to/ref.jpg]
   ```
   - 素の Chrome を debug port 付きで spawn → `connectOverCDP` 接続（Playwright 起動だと Google に蹴られる）
   - プロファイル: `~/.stackchan/gemini-chrome-profile`
   - プロセス衝突時: `pkill -f "gemini-chrome-profile"` して再実行

2. **Gemini マーク消し**: 生成画像の右下にスパークルマーク（✦）が入る
   - note サムネ経由なら `make-thumbnail.js` が**下端 8% クロップで自動処理済み**（`--bg` で渡すだけ）
   - サムネ以外の用途は、下端クロップ or トリミングでマークを落としてから使う

## なぜ Web 版か

- CLI / API 生成（Imagen API 等）はコストの割に品質がイマついた実績多数
- Web 版 Gemini は最新モデルが即使える + 無償枠
- `--ref` で参照画像も渡せる（ベキたん立ち絵の一貫性維持）

## 例外

- `becky_image.py`（感情変数→自動画像生成パイプライン）は Gemini API 直。無人 cron で Web 経由が使えないため。ただし品質不満が出たら Web 経由化を検討

## プロンプト craft

- ボケ/被写界深度: [reference_image_gen_bokeh_prompts.md](reference_image_gen_bokeh_prompts.md)
- 実績: note第15回サムネ（砂時計・和室・朝光、2026-07-03）は「Minimalist Japanese aesthetic. No text, no people」指定が効いた

## 関連

- note 公開フロー全体: `iw-projects/iw-content/notes/docs/becky-context/reference_note_auto_publish_flow.md`
