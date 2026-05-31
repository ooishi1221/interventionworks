# meeting-ai プロジェクト状況

## 現在の構成（2026-05-31 時点）

- Whisper large-v3（ローカル）でリアルタイム文字起こし
- iPhone から Tailscale HTTPS 経由で接続・録音
- 文字起こし結果を `~/.meeting/current.txt` に随時追記
- セッション保存 `~/.meeting/sessions/`
- URL: `https://yuji.tail696407.ts.net`（Tailscale）

## iPhone マイクが強い

遠距離でも精度高い。テレビから離れた場所でも拾える。  
PC マイクと比べて段違い。「テーブルに置くだけ」で全員の声が取れる。

## コスト構造

- 文字起こし（Whisper ローカル）→ 無料
- ベキたんが current.txt を読んで答える → Claude Code サブスク内、無料
- **要約タブ（Claude API）→ 1分ごと自動実行、1時間で約600円 → 廃止**

## 改修履歴

### 2026-05-31 — 要約機能を無効化（コスト問題）

自動要約（`SUMMARY_INTERVAL_MS = 60000`、1分ごと Claude API 呼び出し）を無効化。

**理由**: 累積テキストを毎回丸ごと投げる設計のため、1時間会議で約$4（600円）発生する。  
**対応**: `summaryTimerRef` の setInterval 停止 + 録音停止時の `runSummary()` 呼び出しをコメントアウト。

**将来の復活案**:
- 差分テキストだけ投げる（コスト1/10以下）
- インターバルを5〜10分に伸ばす

## 🔥 2026-06-01 — Expo アプリ動作確認済み

### 今夜の成果（meeting-ai-app）
- Expo Development Build + バックグラウンド録音（多少改善済み）が動いた
- キュー方式（同時1件処理）でファイル抜け減少
- `interruptionMode: "doNotMix"` 追加でバックグラウンド耐久性向上
- 精度は iPhoneマイク + Whisper large-v3 で十分実用レベル

### 明日のタスク（meeting-ai-app）
- [ ] **バックグラウンド正常化** — `copyAsync` がバックグラウンドで失敗する問題を修正
- [ ] **保存済セッション機能追加** — 削除/リネーム/お気に入り/メモ機能
- [ ] **ノイズ削除ボタン削除** — 不要
- [ ] **フッターナビ常時表示** — ホーム/履歴/録音/設定の4タブ

## 次のアクション

- [ ] iPhone バックグラウンドモード対応（Expo ネイティブアプリ化）
  - 「テーブルに置いて画面消えても録り続ける」が完成したら本物
  - `expo-av` でバックグラウンド録音実装、MVP 数日
- [ ] IW ドメイン（`meeting.intervention.jp`）を KAGOYA VPS リバースプロキシで被せる
- [ ] 話者分離（pyannote.audio）
- [ ] GnH カルテへの自動書き込み

## 起動手順

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/iw-local/meeting-ai
bash scripts/start.sh
```
