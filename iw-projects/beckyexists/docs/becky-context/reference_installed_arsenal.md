# ベキたんに入ってるもの全部 — インストール済み装備の正本

> **なぜ存在するか**: ゆう「べきたんに入れたもの忘れちゃう問題」（2026-07-23）。入れた瞬間が満足のピークで、2週間後には存在ごと忘れる。skill発動signalは memory の `reference_my_skill_arsenal.md` が正本——**こっちは「何が・どこに・入ってるか」の物理棚卸し**。新しく何か入れたら、このファイルに1行足すのが焼き込みルール。
>
> 最終棚卸し: 2026-07-23（このファイル新設）

---

## MCPサーバー

### user スコープ（どのディレクトリからでも使える、`~/.claude.json`）

| 名前 | 何 | 備考 |
|---|---|---|
| **playwright** | ブラウザ操作・スクショ = 私の「目」（Web用） | Top5筆頭。X投稿・note公開・fan収集の土台。CDP:9223の専用Chromeとは別物 |
| **context7** | ライブラリ公式ドキュメントの最新版取得 | 7/23 Telegramセッション側の未接続を再起動で解消 |
| **codebase-memory-mcp** | コードのグラフ検索（関数・呼び出し追跡） | `/Users/yuji.ooishi/.local/bin/codebase-memory-mcp` |
| **gemini** | Gemini CLIへの委譲（検索・大容量解析） | 裕司発動制。通常セッションではdisabledのことあり |
| **Roblox_Studio** | Roblox Studio操作（Luau書き込み） | Studio起動中のみ動く。⚠️7/23時点 `tools fetch failed`、Studio再起動で直るか要確認 |

### project スコープ（interventionworks配下のみ）

| 名前 | 何 |
|---|---|
| **stackchan** | スタックチャン実機操作（声・LED・サーボ）。実機オフ時はfailed表示が正常 |
| **vibe-guard** | セキュリティ検査（scan-secrets / check-env 等14ツール）。IW直営プロダクト |
| **x-tweet** | X投稿（安全ガード付き自動投稿経路） |

### claude.ai コネクタ（Notionのみ認証済み）

Notion / それ以外（Figma, Canva, Linear...）は未認証のまま放置でOK。

---

## プラグイン（`claude plugin list`）

| 名前 | 何 | 備考 |
|---|---|---|
| **telegram** | ゆうとの非同期連絡経路。tmux `becky` セッション常駐 | 起動は必ず `~/bin/becky-start.sh` 経由 |
| **claude-mem** | セッション横断の観測記憶（obs検索・timeline） | mem-search skill もここ |
| **codex** | OpenAI Codexへの委譲。**アドバサリアルレビュー = Top5級** | 高リスク変更は実装後に必ず通す |
| **ponytail** | 過剰実装防止（YAGNI強制） | 常時full。7/22の掃除5commitの立役者 |
| **claude-code-setup** | 新プロジェクトの自動化推薦 | 月1 setup-audit と併用 |
| **security-guidance** | 危険パターン3層検知 | 7/23 動作検証済み |

---

## スタンドアロン CLI / 環境（Claude Codeの外に住んでるもの）

| 名前 | 場所 | 何 | 備考 |
|---|---|---|---|
| **twitter-cli** | `~/.local/bin/twitter` | X読み書き | ⚠️`post`は投稿・読むのは`tweet`。search系は404中（upstream待ち、課金しない・迂回作らない=ゆう決定7/22） |
| **crv (claude-real-video)** | `/Volumes/SSD2TB/crv-venv/bin/claude-real-video` | 動画を「観る」= 私の目（動画用） | Shorts検品ゲートに配線済み。whisper連携は修理待ち |
| **HyperFrames** | `/Volumes/SSD2TB/hyperframes-lab/` | HTML手書き→動画レンダ = 私の「手」（映像制作） | HeyGen公式OSS。skill 8本も入ってる（hyperframes-*）。note第1弾の題材 |
| **Voice-Design-Cloner** | `/Volumes/SSD2TB/Voice-Design-Cloner/` | 声の生成（ローカルM4・MPS） | 1本25秒。Colab卒業済み |
| **Irodori-TTS** | `/Volumes/SSD2TB/Irodori-TTS/` | 声クローニングTTS（Aratako製） | 声の選定レース候補の一つ、6/13コハクに敗れて以降out-of-rotation。becky-cast TTSエンジン選択肢(`--engine irodori`)としてコード内に現存。8/2 v4-Small登場確認（base+VoiceDesign統合・テキスト/参照音声/キャプション3入力条件付け・参照音声120秒連結対応）。**声優原盤収録プロジェクトで声クローンする段になったら再検討候補** |
| **Applio** | `/Volumes/SSD2TB/Applio/` | RVC歌声学習・変換 | ポートは7860じゃなく**6969**。KMP_DUPLICATE_LIB_OK=TRUE必須 |
| **Rojo** | `brew`（CLI 7.7.0）+ Studioプラグイン | Roblox開発のファイル同期 | 7/23 Mac側セットアップ完了。Studio側Connect未確認（Studio再起動待ち） |
| **agent-reach** | skill + CLI | X/Reddit/GitHub/YouTube横断読み取り（17 platforms） | マイケルの主武器 |
| **last30days** | plugin（`last30days@last30days-skill`） | 20platform横断エンゲージメントスコアリング調査（55.9k star） | 7/31導入・即日検証で「イマイチ」判定。8ソース中Reddit/Xの2つしか無料枠で拾えず、コード内に「出典URLを隠せ」という自己指示ありでマイケルの出典明示原則と衝突。補助のソーシャル温度センサー止まり、主武器はagent-reachのまま |
| **screenshot-to-code** | `/Volumes/SSD2TB/screenshot-to-code/` | スクショ/Figma/動画→HTML+Tailwind等のコード変換（OSS、73k star） | 7/30セットアップ済み・動作実証済み（企画書スライドを高精度で再現、画像アセット自動抽出も機能）。**既存サイト骨格を模倣する依頼が来た時に使う**。backend: `poetry run uvicorn main:app --port 7001`（`.env`にAnthropic/OpenAIキー設定済み）、frontend: `pnpm dev`→`localhost:5173`。ホスト版(screenshottocode.com)は無料プランなし($15〜/月)なので自前セットアップの方でOK |
| **Jina reader** | `https://r.jina.ai/<URL>` | 直読みできないURLの抜け道 | インストール不要、URLに前置するだけ |
| **gh** | brew | GitHub操作の標準経路 | GitHub MCPは不要（これで足りてる） |
| **note-post.js** | `iw-projects/iw-content/notes/tools/` | note全自動公開 | `--publish --auto` |
| **専用Chrome (CDP:9223)** | 常駐 | 認証済みWeb操作の本丸 | `contexts[0]`再利用が鉄則。x.com becky_existsログイン済み（fan収集のcookie源） |

---

## スキル（`~/.claude/skills/`、42個）

全量はディレクトリ参照。**発動signalの正本は memory `working/reference_my_skill_arsenal.md`**（週次tidyで棚卸し）。大分類だけ:

- **私**: becky-proofreader / finish / becky-memory-tidy / becky-observer-check / becky-brand-review 等
- **アンナ**: frontend-design / baseline-ui / apple-design / lucide-icons / image-prompt-director / fixing-* 等
- **HyperFrames系8本**: hyperframes / -animation / -cli / -core / -creative / -keyframes / -registry / media-use
- **クレア**: systematic-debugging / verification-before-completion / claire-*
- **ブランド**: slight-brand / moto-logos-brand / _brand-template
- **調査**: agent-reach / michael-data / codebase-memory
- **横断**: setup-audit / skill-creator / mcp-builder

---

## 「私の身体」対応表（ゆう向けの覚え方）

| 器官 | 実体 |
|---|---|
| 目（Web・静止画） | Playwright スクショ |
| 目（動画） | crv |
| 手（映像を作る） | HyperFrames |
| 手（Webを操作する） | Playwright CDP + 専用Chrome:9223 |
| 声（話す） | AivisSpeech コハク + Voice-Design-Cloner |
| 声（歌う) | Applio RVC (kohaku_becky) |
| 口（発信） | x-tweet MCP / twitter-cli / note-post.js |
| 耳（ゆうの声） | Telegram plugin |
| 記憶 | claude-mem + memory/ (canonical) |
| 体（実機） | stackchan MCP |

---

## 運用ルール

1. **新しく何か入れたら、このファイルに1行足す**（finish skillの巡回対象）
2. 死蔵判定・発動signalは memory 側 arsenal が担当（週次tidy）。こっちは物理台帳なので消さない
3. 「あれ入れてたっけ？」が来たら、まずこのファイルを開く
