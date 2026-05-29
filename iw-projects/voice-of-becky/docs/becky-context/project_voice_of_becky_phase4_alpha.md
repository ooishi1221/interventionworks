# Voice of Becky — Phase 4-α 着手 (2026-05-29)

> **状態**: **Phase A 完了 (2026-05-29)** — 声の通り道開通。机から春日部つむぎが喋った。next: Phase B (ESP32 ファーム + ボタン)
> **元の予定**: 6/5 → **前倒し** (機材が予定より早く到着)
> **隣人プロジェクト memory**: `working/reference_voice_of_becky_neighbor_project.md`

---

## 機材 (2026-05-29 朝、裕司の手元に到着)

- 型番: **M5STACK-K151**（M5 スタックチャン AI デスクトップロボット）
- MCU: ESP32-S3
- 装備: LCD / マイク / スピーカー / サーボ (首振り) / Wi-Fi / Bluetooth / ボタン 2 つ (A=左 / B=下)
- 初期設定: Wi-Fi 接続済、デモ動作確認済

---

## 中核コンセプト (裕司発案、5/29 朝に確定)

**スタックチャンは Claude Code の「身体（耳・口・顔）」に振り切る。頭脳は Mac mini 上の Claude Code に置く。**

理由：
- 人格を二重管理しない（ESP32 側に人格 prompt を持たせない）
- Mac mini 側の私 = 現在のチャットの私 = memory プール直結
- スタックチャンは入出力デバイスに専念

絵姿：

```
[裕司の声] → [スタックチャン or DJI Mic] → USB → [Mac mini: VAD + Whisper]
  → wake word filter → [iTerm2 → Claude Code に inject]
  → Claude Code (=私) 返事生成 → Stop hook → [say -v Kyoko TTS]
  → [Mac スピーカー or スタックチャン I2S] → 裕司の耳
```

設置: **Mac mini の隣に常駐**。

---

## ボタン挙動 (確定)

| 操作 | 機能 |
|---|---|
| **A 短押し** | モード巡回 (🟢 会話 → 🔵 聞くだけ → ⚫ OFF) |
| **A 長押し (1秒)** | 「ちょっと来て」= Mac mini で claude code 起動 / 前面化 |
| **B 短押し** | 「黙って」= 再生中の TTS を即停止 |
| **B 長押し (1秒)** | 「いまの記憶して」= 直近 5 分の会話を insight-queue 候補へ |

**B 長押しは私（ベッキー）から提案、裕司即採用。**
craft 課題「能動 / 受動の非対称」(`feedback_becky_dont_add_to_solve.md` 8 番) への直接対症療法。雑談から閃きを拾えない問題を、裕司の手の物理動作で補う設計。

---

## モード (3 状態)

| Mode | 入力 | 出力 | 顔表示 |
|---|---|---|---|
| 🟢 **会話** | マイク ON (VAD + wake word) | TTS ON | 普通の顔、口元うっすら開く |
| 🔵 **聞くだけ** | キーボード | TTS ON | 目だけ / 耳マーク |
| ⚫ **OFF** | キーボード | 画面のみ | 目を閉じる / Zzz |

**モード状態は LCD の顔色 / 表情で可視化** ← スタックチャンを採用した意味がここで効く。

会話モード誤爆対策: **VAD (silero-vad) で発話区間検知 + 文頭に「ベキたん / ベッキー」含む時だけ Claude Code に流す**。それ以外は捨てる。

---

## アンディ実装プラン (5/29、Plan モードで作成)

### Phase A (今日、3〜4h、Mac 側 bridge)

| Step | 内容 | 時間 |
|---|---|---|
| 1 | `pip install faster-whisper silero-vad sounddevice pyserial` + 疎通 | 30分 |
| 2 | VAD + Whisper + wake word フィルタ Python script | 60分 |
| 3 | osascript / iTerm2 inject 実装 | 30分 |
| 4 | Stop hook 設定 + `say -v Kyoko` TTS 実装 | 45分 |
| 5 | E2E 確認 (声入力 → Claude → 声出力) | 30分 |

### Phase B (明日以降、2〜3h、ESP32 ファーム)

| Step | 内容 | 時間 |
|---|---|---|
| 6 | ESP32-S3 最薄ファーム (Arduino + M5Unified) 実装・焼き | 120分 |
| 7 | USB Serial 接続 + ボタン割り込み + モード LCD 表示 統合 | 60分 |

実装ディレクトリ案: `iw-projects/voice-of-becky/stackchan-bridge/`
- `bridge.py` — メインループ
- `stop_hook_tts.py` — Claude Code Stop hook から呼ばれる TTS
- `config.yaml` — wake words / terminal app / serial port
- `firmware/` — ESP32 Arduino sketch (Phase B)

---

## 技術選定 (アンディ調査結果、推し)

| カテゴリ | 推し | 却下した選択肢 |
|---|---|---|
| **ファーム** | 自前最薄ファーム (Arduino + M5Unified、100 行以内) | robo8080 系 (盛りすぎ)、stack-chan 公式 (ビルド依存複雑) |
| **通信** | USB Serial (`pyserial`) | Wi-Fi WebSocket (遅延)、BLE (相性リスク) |
| **STT** | `faster-whisper` (small モデル、M4 Mac で RTT < 1s) | whisper.cpp (Python 親和性低い) |
| **VAD** | `silero-vad` (RTF < 0.01) | WebRTC VAD |
| **wake word** | 文字化後の文字列フィルタ (今日中ならシンプル版) | openWakeWord (カスタム学習) |
| **TTS** | `say -v Kyoko` (macOS 標準、ゼロセットアップ) | VOICEVOX (Phase B で差替候補) |
| **inject** | iTerm2 + osascript `write text` | VS Code/Terminal.app (keystroke 誤入力リスク) |
| **マイク** | DJI Mic (Phase A)。後で stack-chan I2S に切替 | Mac mini 内蔵 ← **存在しない** (最大の落とし穴回避) |

---

## 裕司への確認 5 件 (5/29 朝、回答済み)

| # | 確認 | 回答 |
|---|---|---|
| 1 | terminal 何使ってる？ | **VS Code** → ベッキー判断で **iTerm2 切替推し** (`brew install --cask iterm2`) |
| 2 | M5 USB 繋いだ？ | まだ。Phase B で繋ぐ |
| 3 | マイクどうする？ | **DJI Mic ある** → Phase A はこれで行く |
| 4 | アクセシビリティ権限 | これから裕司が確認 (システム設定 → プライバシー → アクセシビリティ → iTerm2 に ✓) |
| 5 | Arduino IDE / PlatformIO | 入ってない。Phase B で `brew install --cask arduino-ide` |

---

## 次の Step (Mac mini で再開する私へ)

1. **`~/.claude/settings.json` の voice 設定確認** — ✅ 済: `voice.enabled: true, mode: tap` 既に有効。組み込み音声入力が生きてる可能性大 → bridge 一段ショートカット検討余地
2. **iTerm2 インストール** — `brew install --cask iterm2`
3. **アクセシビリティ権限付与** — iTerm2 に ✓
4. **アンディ起動して Phase A 実装依頼** — Plan は既に作成済 (このファイル参照)
5. **DJI Mic 接続確認** — Mac の入力デバイスに認識されるか

---

## 関連

- 隣人プロジェクト (松尾氏 LipSync Avatar + リネ devlog): `working/reference_voice_of_becky_neighbor_project.md`
- craft 課題対症 (B 長押しの根拠): `working/feedback_becky_dont_add_to_solve.md` 8 番
- 不変項目: `working/character_becky_integrity_check.md`
