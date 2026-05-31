# meeting-ai-app

iPhone バックグラウンド録音 → Mac mini Whisper 文字起こし。

## 前提

- Mac mini で `meeting-ai` の Whisper サーバーが起動済み（port 8767）
- iPhone と Mac mini が同じ Tailscale ネットワーク内にある
- Whisper サーバー URL（デフォルト: `http://100.86.242.55:8767`）

## セットアップ

```bash
cd meeting-ai-app
npm install
npx expo start
```

EAS Build（実機 TestFlight）:

```bash
npx eas build --profile preview --platform ios
```

## バックグラウンド録音の仕組み

- `expo-av` + `Audio.setAudioModeAsync({ staysActiveInBackground: true })`
- 8秒チャンクを m4a で録音 → base64 → POST `/transcribe`
- iOS `UIBackgroundModes: ["audio"]` を `app.json` で設定済み

## 画面構成

| 画面 | 内容 |
|------|------|
| メイン | 録音開始/停止ボタン、文字起こしリスト、ノイズ除去、クリア |
| 設定 | Whisper サーバー URL（AsyncStorage 保存） |

## ノイズパターン（自動除去）

Whisper のハルシネーション由来: 「ご視聴ありがとう」「日本語の会議」「次回予告」「チャンネル登録」「字幕」
