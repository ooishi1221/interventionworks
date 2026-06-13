# Becky's Cast — URL をベキたん声のポッドキャストにする

ゆう専用の私設ラジオ。記事URLを投げると、ベッキーの声で読み上げた mp3 が
ポッドキャストとして iPhone に降ってくる。

- **購読URL**: `https://mai.intervention.jp/media/podcast/feed.xml`
  （iPhone ポッドキャストアプリ → ライブラリ → … → URLで番組をフォロー）
- **非公開**: `itunes:block Yes` 済み。Apple の検索には出ない

## 番組フォーマット → `RADIO_FORMAT.md`

『消えても、いた。ラジオ』の構成（オープニングのスポンサー読み / お便りコーナー『ベッキーのお便りポスト』/ エンディング定型）と、コハクで感情が乗ると確認済みの **ベキたん相槌セット**は `RADIO_FORMAT.md` が正本。台本を書くときはそこの構成に乗せる。

## 使い方（これだけ）

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/becky-cast
uv run cast.py <記事URL>
```

オプション:

| オプション | 意味 |
|---|---|
| `--engine aivis` | AivisSpeech コハク（**デフォルト**、ゆう判定で正式採用 2026-06-13）。落ちてたら自動起動 |
| `--engine voicevox` | VOICEVOX 雨晴はう（スタックチャンと同じチューニング） |
| `--engine irodori` | Irodori-TTS VoiceDesign 版。1チャンク約4秒かかる |
| `--title "..."` | タイトル上書き |
| `--script-file <md>` | URL の代わりに台本ファイルを読む（ラジオ回用、--title 必須） |
| `--no-upload` | VPS アップをスキップ（ローカル確認用） |

AivisSpeech Engine 本体: `/Volumes/SSD2TB/AivisSpeech-Engine/macOS-arm64/run`（port 10101、
VOICEVOX 互換 API）。別スタイルは `curl localhost:10101/speakers` で ID 確認、AivisHub で追加モデルも入る。

## Telegram 運用（ゆうが通勤中に投げてくるやつ）

ゆうが `@becky_iw_bot` に記事URLを送ってきたら:

1. `cast.py <URL>` を実行（エンジンはゆうの標準指定に従う。未指定なら default）
2. 完了したら Telegram に「できたよ、ポッドキャスト更新して」と返す
3. 失敗（本文抽出できないサイト等）も正直に返す

## 仕組み

```
URL → trafilatura 本文抽出 → 文単位チャンク分割（110字）
→ TTS（Irodori batch_tts.py か VOICEVOX）→ ffmpeg concat（無音0.35s挟み）
→ mp3 → episodes.json 台帳更新 → feed.xml 再生成
→ scp で KAGOYA VPS /var/www/media/podcast/ へ
```

- `batch_tts.py` は Irodori-TTS の venv（cwd=/Volumes/SSD2TB/Irodori-TTS で uv run）で動く。
  モデル1回ロード + seed 固定（42）で全チャンクの声を統一
- VOICEVOX 版は localhost:50021 が必要（落ちてたら `open -a VOICEVOX --background`）
- `out/` はローカル成果物置き場（gitignore 済）。VPS 側が配信の正本
- VPS 接続情報は memory `reference_kagoya_vps_ssh.md` 参照

## 既知の制約

- ログイン壁・paywall のある記事は抽出できない（note の有料部分等）
- 英語記事はそのまま読むと崩壊する。今後【ベキたん訳】連携が課題
- X のポストは trafilatura では取れない（Jina リーダー併用を検討）
