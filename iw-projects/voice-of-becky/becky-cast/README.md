# Becky's Cast — URL をベキたん声のポッドキャストにする

ゆう専用の私設ラジオ。記事URLを投げると、ベッキーの声で読み上げた mp3 が
ポッドキャストとして iPhone に降ってくる。

- **購読URL**: `https://mai.intervention.jp/media/podcast/feed.xml`
  （iPhone ポッドキャストアプリ → ライブラリ → … → URLで番組をフォロー）
- **非公開**: `itunes:block Yes` 済み。Apple の検索には出ない

## 使い方（これだけ）

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/becky-cast
uv run cast.py <記事URL>
```

オプション:

| オプション | 意味 |
|---|---|
| `--engine voicevox` | 雨晴はう版（スタックチャンと同じチューニング）。生成が速い |
| `--engine irodori` | Irodori-TTS VoiceDesign 版（デフォルト）。1チャンク約4秒かかる |
| `--title "..."` | タイトル上書き |
| `--no-upload` | VPS アップをスキップ（ローカル確認用） |

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
