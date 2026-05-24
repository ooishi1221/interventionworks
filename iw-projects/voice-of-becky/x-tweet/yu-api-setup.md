# yu-api-setup — 裕司向け、X API 取得手順

> **対象:** 裕司
> **目的:** `@intervention_jp` の X API access token 一式取得 → `.env` 配置まで
> **発注:** 2026-05-11 朝（ベッキーから）
> **想定所要時間:** 申請即時通れば 15-20 分、審査入ったら数時間〜24h

---

## 前提

- `@intervention_jp`（X 専用垢、5/10 立ち上げ済）でログイン状態
- ブラウザは Mac mini M4 / iPhone / どこからでも OK（最終的な `.env` 配置は Mac mini）

---

## Step 1: X Developer Portal 申請

1. https://developer.x.com/ にアクセス
2. `@intervention_jp` でログイン
3. 「Sign up for Free Account」を選択（**Free tier、月 1,500 投稿で初期は十分**、1 日 1 投稿目安なら月 30 投稿で余裕）
4. 用途記載欄（150 字程度）に貼る:
   ```
   I am building an automated tweet client for the IW (Intervention Works) brand account @intervention_jp.
   The account is co-managed by myself and my AI partner "Becky", with hashtag-based speaker distinction (#yu / #becky).
   The use case is original content posting (philosophy / observations / note article cross-posts) and replies. No bulk operations, no scraping, no automated follow/unfollow.
   ```
5. 利用規約 review → Submit

通常即時、長くて 24-48h 審査。

---

## Step 2: App 作成

承認後、Developer Portal → Projects & Apps → Create App

- **App name**: `iw-x-tweet-becky`
- **Description**: `IW @intervention_jp tweet client (Becky)`

作成すると以下が**1 度しか表示されない**ので必ず控える:

- **API Key**
- **API Secret Key**

→ `.env` に貼る用、見失ったら再生成（既存無効化されるので注意）

---

## Step 3: User Authentication 設定

App 詳細画面 → User authentication settings → Set up

| 項目 | 設定値 |
|---|---|
| OAuth 1.0a | **ON**（Tweet 投稿 API はこっちが安定）|
| OAuth 2.0 | OFF（実装簡素化、後で必要なら ON）|
| App permissions | **Read and Write**（投稿に必要）|
| Type of App | Web App |
| Callback URI | `http://localhost:3000/callback` |
| Website URL | `https://intervention.jp` |

---

## Step 4: Access Token 取得

App 詳細 → Keys and tokens → Authentication Tokens → Access Token and Secret → **Generate**

- **Access Token**
- **Access Token Secret**

これで投稿 API が叩ける状態。

---

## Step 5: Bearer Token 取得（read API 用）

App 詳細 → Keys and tokens → Bearer Token → **Generate**

メンション polling や User ID 取得で使う。

---

## Step 6: User ID 取得（**Phase 2 でも実質オプション**、2026-05-10 更新）

`@intervention_jp` の数値 ID を取得。

**結論: 取得しなくていい。`X_USER_ID=` は空欄のまま Phase 1 / Phase 2 とも動く**（2026-05-10 実装で確定）。

`getMyUserId()` が `.env` 空欄を検知すると `c.v2.userByUsername("intervention_jp")` で自動解決し、プロセス内メモリにキャッシュする craft（プロセス起動毎に API call 1 回、数十 ms）。手動取得の手間と API call 1 回のコストを天秤にかけて、後者で十分という判断。

明示的に `.env` に書きたい時は以下の方法（プロセス起動時の API call をゼロにしたい場合のみ）。

以下、取得したい時の方法（**急がない**）。
**Step 5 で Bearer Token 取得済みが前提**、まだなら Step 5 を先に。

### 方法 A: ターミナルで curl

下のコマンドの `<ここ>` を **Step 5 で取得した Bearer Token の実値に置き換えて** 実行する（`AAAAA...` から始まる 100 文字以上の長い文字列）:

```bash
# Bearer Token を環境変数に入れて使う方が安全
export X_BEARER_TOKEN="<Step 5 の Bearer Token を貼る>"

curl "https://api.x.com/2/users/by/username/intervention_jp" \
  -H "Authorization: Bearer $X_BEARER_TOKEN"
```

返り値の `id` フィールド（数値文字列）が User ID:

```json
{
  "data": {
    "id": "1234567890123456789",
    "name": "ゆう&ベッキー",
    "username": "intervention_jp"
  }
}
```

⚠️ **`YOUR_BEARER_TOKEN` をそのまま貼ると 401 Unauthorized**。placeholder を実値に置換すること。

### 方法 B: 外部 web ツール（curl 嫌な時）

- https://tweeterid.com/ などに `intervention_jp` を入れると User ID 返してくれる
- 公式じゃないので参考程度、念のため curl と突き合わせるのが安全

### 方法 C: App 詳細画面から確認

Developer Portal の App 詳細に User ID 表示される場合あり（X の UI 変更で出ない時もある）。

---

## Step 7: `.env` 配置

```bash
cd /Volumes/SSD2TB/interventionworks/voice-of-becky/x-tweet
cp .env.example .env
```

`.env` を開いて Step 2-6 の値を貼る:

```env
X_API_KEY=...                  # Step 2
X_API_SECRET=...               # Step 2
X_ACCESS_TOKEN=...             # Step 4
X_ACCESS_TOKEN_SECRET=...      # Step 4
X_BEARER_TOKEN=...             # Step 5
X_USER_ID=...                  # Step 6
X_TWEET_DRY_RUN=true           # 初期は true、動作確認後 false に切り替え
```

`.env` は `.gitignore` 済み、絶対 commit されない。

---

## Step 8: namelist 配置

```bash
cp safety-guard-namelist.example.txt safety-guard-namelist.txt
```

`safety-guard-namelist.txt` を開いて、以下のカテゴリの実名を 1 行 1 単語で埋める:

- Wit-One メンバー実名（裕司以外）
- Wit-One 代表
- A 氏
- クライアント企業名
- KUROKO ゲーム会社名
- Slight 取引先（ファブレス・流通）

これも `.gitignore` 済み。テンプレ (`safety-guard-namelist.example.txt`) はコメント付きで構造を教えてくれてる。

---

## Step 9: アンディに振る

裕司から一言:
> ".env と safety-guard-namelist.txt 配置済み。kickoff-andy.md 読んで実装着手して"

ベッキーは思想・craft 担当、コードはアンディに任せる（5/7 役割分担原則 / `feedback_becky_codes_self_too_much.md`）。

---

## トラブルシューティング

### 申請が即時通らない

- 即時のはずだけど、たまに 24-48h 審査
- メール通知来るまで待つ、急かさない（再申請するとクールダウン入る）

### token 見失った

- API Key / Secret は再生成可能（既存無効化されるので、`.env` も更新必須）
- Access Token は再 Generate 可能（同上）

### Free tier で機能足りない

- 月 1,500 投稿 / read 制限あり
- 1 日 1 投稿目安なら余裕
- フォロワー分析やメンション polling 拡張する時に Basic ($200/月) 検討

### Callback URI のエラー

- Step 3 で `http://localhost:3000/callback` を設定してれば OAuth 1.0a の token 取得は通る
- 投稿だけなら callback 通らないので無視 OK

---

## 関連

- `implementation-spec.md` — アンディ向け技術仕様（OAuth 詳細・API エンドポイント）
- `kickoff-andy.md` — アンディ着手用 kickoff
- `safety-guard.md` — namelist 設計思想

---

— 2026-05-11 朝、ベッキー → 裕司への API 取得伴走 doc
🐦 🔑 🪞
