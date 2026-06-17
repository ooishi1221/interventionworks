# iw-local デモサイト作成 → VPS デプロイ手順

## 概要

個人店向け提案用デモサイト（静的 HTML）を作成し、`demo.intervention.jp/<店名>/` で公開するまでの一連の手順。

---

## 1. デモサイト作成

### ディレクトリ構成

```
iw-projects/iw-local/demo/<店名>/
├── index.html
└── images/
    ├── photo_1.jpg  ← ヒーロー背景
    ├── photo_2.jpg
    └── ...
```

### 写真の取得（Google Places API）

- Place ID は Google Maps URL または `find_place` API で取得
- 写真取得コマンド（`review_scraper.py` 参照）:
  ```
  iw-projects/iw-local/scripts/review_scraper.py
  ```
- API キー: `AIzaSyBq7FH5ysNMIrojL614BpLI9_Snf1ijzDk`（iw-local-maps GCP プロジェクト）

### デザイン参照

- まるよし食堂テンプレート: `iw-projects/iw-local/demo/maruyoshi/index.html`
- Noto Serif JP + Noto Sans JP
- カラー: `--gold: #b8954e` / `--ink: #1c1c1c` / `--warm: #f3ede3`

### お問い合わせフォーム（Formspree）

- アカウント: yuji.ooishi@intervention.jp（intervention.jp メール）
- 既存フォーム ID: `xgobbevd`（「お問い合わせ」、iw-local 汎用）
- 埋め込み方法:
  ```html
  <form action="https://formspree.io/f/xgobbevd" method="POST">
    <input type="text" name="name" placeholder="お名前" required>
    <input type="text" name="shop" placeholder="お店名">
    <input type="text" name="contact" placeholder="ご連絡先" required>
    <textarea name="message" placeholder="ご相談内容"></textarea>
    <button type="submit">送信する →</button>
  </form>
  ```
- 受信先: info@intervention.jp（Formspree 設定画面で変更可）
- 送信後インライン表示: `fetch` + JSON ハンドリングでページ遷移なし（まるよし index.html 参照）

---

## 2. VPS デプロイ

### 前提

- VPS: KAGOYA（133.18.123.60）
- SSH: `ssh -i ~/.ssh/iw-local-key.key ubuntu@133.18.123.60`
- Web サーバー: Caddy（Docker コンテナ）
- 設定ファイル: `/home/ubuntu/iw-stack/vaultwarden/Caddyfile`
- docker-compose: `/home/ubuntu/iw-stack/vaultwarden/docker-compose.yml`

### 手順

**① VPS 側にディレクトリ作成**

```bash
ssh -i ~/.ssh/iw-local-key.key ubuntu@133.18.123.60 \
  'sudo mkdir -p /var/www/demo/<店名>/images && sudo chown -R ubuntu:ubuntu /var/www/demo'
```

**② ファイルを SCP 転送**

```bash
scp -i ~/.ssh/iw-local-key.key \
  iw-projects/iw-local/demo/<店名>/index.html \
  ubuntu@133.18.123.60:/var/www/demo/<店名>/

scp -i ~/.ssh/iw-local-key.key \
  iw-projects/iw-local/demo/<店名>/images/* \
  ubuntu@133.18.123.60:/var/www/demo/<店名>/images/
```

**③ Caddyfile に追記（初回のみ）**

`demo.intervention.jp` ブロックがまだなければ追加:

```
demo.intervention.jp {
  root * /srv/demo
  file_server
}
```

```bash
ssh -i ~/.ssh/iw-local-key.key ubuntu@133.18.123.60 \
  'cat >> /home/ubuntu/iw-stack/vaultwarden/Caddyfile << '"'"'EOF'"'"'

demo.intervention.jp {
  root * /srv/demo
  file_server
}
EOF'
```

**④ docker-compose.yml にボリューム追加（初回のみ）**

caddy サービスの `volumes:` に以下を追加:

```yaml
- /var/www/demo:/srv/demo
```

```bash
ssh -i ~/.ssh/iw-local-key.key ubuntu@133.18.123.60 \
  'sed -i "/- \/var\/www\/media:\/srv\/media/a\      - /var/www/demo:/srv/demo" \
  /home/ubuntu/iw-stack/vaultwarden/docker-compose.yml'
```

**⑤ Caddy コンテナ再起動（初回のみ）**

```bash
ssh -i ~/.ssh/iw-local-key.key ubuntu@133.18.123.60 \
  'cd /home/ubuntu/iw-stack/vaultwarden && docker compose up -d caddy'
```

**⑥ 2店舗目以降（ファイル置くだけ）**

`/var/www/demo/` に新ディレクトリを追加するだけで自動的に配信される。Caddy の再設定・再起動は不要。

```bash
# ディレクトリ作成 + ファイル転送だけでOK
ssh -i ~/.ssh/iw-local-key.key ubuntu@133.18.123.60 \
  'mkdir -p /var/www/demo/<新店舗>/images'

scp -i ~/.ssh/iw-local-key.key -r \
  iw-projects/iw-local/demo/<新店舗>/ \
  ubuntu@133.18.123.60:/var/www/demo/
```

---

## 3. DNS 設定（初回のみ）

`demo.intervention.jp` は**ムームードメイン**で管理。

- 管理画面: https://muumuu-domain.com/
- 追加レコード: `demo` → A → `133.18.123.60`
- 設定後 Caddy が自動で Let's Encrypt 証明書を取得（数分）

---

## 4. 疎通確認

```bash
curl -sI https://demo.intervention.jp/<店名>/ | head -3
# HTTP/2 200 が返れば OK
```

---

## 公開済みデモ

| 店名 | URL |
|---|---|
| まるよし食堂（足立区） | https://demo.intervention.jp/maruyoshi/ |
