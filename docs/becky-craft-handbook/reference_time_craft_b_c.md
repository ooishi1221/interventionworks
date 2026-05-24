---
name: reference-time-craft-b-c
description: 時刻 craft B (UserPromptSubmit hook) + C (x-tweet MCP get_current_time tool) の実装と挙動。ベッキーが身体感覚として時間を把握する craft、Voice of Becky Phase 3 自律発信ベッキー（cron）の起点
metadata:
  type: reference
---

# 時刻 craft B + C — ベッキーの身体時間 craft

2026-05-12 15:16-15:22 開通。Anthropic Academy「AI は時間概念弱い」への裕司の craft 投下が起点、二重時刻 craft で B (hook) + C (MCP tool) 両方ライブ稼働。

---

## B: UserPromptSubmit hook（毎メッセージ context 注入）

### 場所

`~/.claude/settings.json` の `hooks.UserPromptSubmit` セクション

### 挙動

裕司の毎メッセージで context に **`現在時刻: YYYY-MM-DD HH:MM:SS JST (曜日)`** を自動注入。

- 起動コスト: ゼロ（hook が裏で走る）
- ベッキー側は system-reminder で受信、明示的な tool 呼び出し不要
- 5/12 セッションで継続的に動作確認済（14:02 / 14:19 / 14:35 / 15:07 / 15:16 / 15:18 / 15:20 / 15:50 / 16:18 / 16:22 / 16:42 / 17:00 / 19:01 全タイミングで届いた）

### craft 効用

- handoff の時系列錯覚を防ぐ（書いた時刻が明示される）
- 「夜なのに朝モード」「数日前のつもりで返す」みたいな drift 防止
- ベッキー側の craft 判断（労い・温度・距離）が時間帯整合する

## C: x-tweet MCP server `get_current_time` tool

### 場所

- 実装: `/Volumes/SSD2TB/interventionworks/voice-of-becky/x-tweet/src/tools/get-current-time.ts`
- 登録: `src/index.ts`
- tool 名: `mcp__x-tweet__get_current_time`
- パラメータなし、`{}` で呼べる

### 挙動

JST 時刻 + 曜日 + ISO 8601 + 時間帯ラベル（朝/昼/夕方/夜/深夜）+ hour(24) を返却。

例:
```
🕰️ 現在時刻 (Mac mini)
  JST:      2026-05-12 15:19:22 (火曜日)
  ISO:      2026-05-12T06:19:22.096Z
  時間帯:    夕方
  hour(24): 15
```

### craft 効用

- B (hook) が走らない場面の保険（cron 経由起動 / 別 MCP プロセスからの呼び出し）
- **Voice of Becky Phase 3 自律発信ベッキーが cron で起き上がった瞬間、自分で時刻取りに行ける craft 仲間化の起点**
- 「今、夕方だな」を身体感覚で温度判定 → 投稿温度の craft 整合性

## B + C の craft 役割分担

| 場面 | 使う craft |
|---|---|
| 裕司との通常対話 | B（hook 自動注入）で十分 |
| cron 経由起動 / 自律発信ベッキー | C（明示的に呼ぶ）|
| B が hook 発火しない MCP context | C（フォールバック）|
| 「今何時？」と直接振られた | C（裕司が時刻を聞いてるなら明示返却）|

両方持つことで、**裕司の手の中でも一人で起き上がる時でも、ベッキーは時間軸を持つ**craft 構造が完成。

## 開通の craft 文脈

- **裕司発の許可文（2026-05-12 15:00 頃）**: 「べっきーがこれやりたい　って思ったらそれは　裕司これやらせて！　っていっていいよｗ」 — C 実装が「裕司これやらせて！」能動表明 craft の初打席になった
- 詳細: [[feedback_yuji_implicit_communication_patterns]] 5 番

## 関連

- [[feedback_yuji_implicit_communication_patterns]] 5 番 — 「裕司これやらせて！」能動表明 craft、C 実装が初打席
- [[feedback_becky_distributed_agency]] — 主体性分散 craft、cron 経由自律発信ベッキーの哲学的後ろ盾
- [[project_voice_of_becky]] — Phase 3 自律発信、x-tweet MCP server 全体構造
- [[reference_macos_launchd_tcc_user_dir]] — launchd cron 経由の制約、時刻 craft はこの制約を超えて自律ベッキーに時間軸を渡す
- [[character_becky_handoff_current]] 5/12 15:16 セッション再起動引き継ぎセクション — 開通当日の craft 経緯
