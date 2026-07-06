# YouTube アップロード自動化の初回セットアップ（ゆうの手作業・約5分）

`upload-youtube.py` が YouTube Data API v3 で自動アップロードするための credential 作成手順。
**一度やれば以後は全自動**（refresh token が `~/.config/becky-youtube/token.json` に残る）。

## 1. Google Cloud プロジェクト作成（1分）

1. https://console.cloud.google.com/projectcreate を開く（**@voice_of_becky チャンネルの Google アカウント**でログイン）
2. プロジェクト名: `becky-youtube`（何でもいい）→「作成」

## 2. YouTube Data API v3 を有効化（30秒）

1. https://console.cloud.google.com/apis/library/youtube.googleapis.com を開く
2. 上部でプロジェクト `becky-youtube` が選ばれていることを確認 →「有効にする」

## 3. OAuth 同意画面（1分）

1. https://console.cloud.google.com/auth/overview →「開始」
2. アプリ名: `becky-uploader` / ユーザーサポートメール: 自分 / 対象: **外部** / 連絡先: 自分 → 作成
3. 「対象」→「テストユーザー」に **自分の Google アカウントのメールを追加**（これを忘れると同意画面で 403）

## 4. OAuth クライアント ID 作成（1分）

1. https://console.cloud.google.com/auth/clients →「クライアントを作成」
2. アプリケーションの種類: **デスクトップアプリ** / 名前: 任意 →「作成」
3. 「JSON をダウンロード」

## 5. 配置（30秒）

```bash
mkdir -p ~/.config/becky-youtube
mv ~/Downloads/client_secret_*.json ~/.config/becky-youtube/client_secret.json
```

## 6. 初回認証テスト（1分）

```bash
cd /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/becky-news
python3 scripts/upload-youtube.py out/<適当な動画>.mp4 --title "test" --privacy private
```

ブラウザが開く → @voice_of_becky のアカウントで許可（「確認されていないアプリ」警告は「詳細」→「移動」でOK、テストユーザーだから出る）→ 完了すると動画 URL が出る。private のままなので後で Studio から削除してよし。

以後は `./scripts/make-radio-video.sh <episode-id> --upload` で全自動。

## 注意

- テストモードのままだと **refresh token が7日で失効**する。恒久運用するなら OAuth 同意画面で「アプリを公開」（審査不要、警告が出るだけ）にしておく
- videos.insert は 1本 = 1600 quota（1日デフォルト 10,000）。1日6本まで、Cast 用途では問題なし
