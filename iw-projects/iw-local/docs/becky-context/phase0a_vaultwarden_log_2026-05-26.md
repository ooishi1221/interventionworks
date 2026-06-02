---
title: Phase 0a Vaultwarden 立ち上げ体感 log (2026-05-26)
description: iw-local Phase 0a 初日の craft 体感記録。KAGOYA Cloud VPS 契約 → Vaultwarden + Caddy + Let's Encrypt + vault.intervention.jp 稼働までの 90 分連戦 craft tree、体感ピーク「自分のサービスみたいでカッケー！」の言語化。
date: 2026-05-26
phase: 0a
status: 完了
---

# Phase 0a 初日 craft log — Vaultwarden 完全稼働 (2026-05-26)

## 結論

90 分で **「個人 IT インフラを正規ドメイン + HTTPS で運用する craft」完成**。`https://vault.intervention.jp` で裕司の personal Vaultwarden 稼働。

体感ピーク: 14:31「**自分のサービスみたいでカッケー！**」(裕司)

## craft tree (実行 timeline)

```
12:56 KAGOYA Cloud VPS 申込 (Cloud VPS 2GB / 月 770 円)
13:08 インスタンス作成完了 (IP: 133.18.123.60)
13:16 SSH 接続成功 (ubuntu user, ED25519 key)
13:24 Docker CE / docker-compose 動作確認 (事前構築済 craft)
13:35 Vaultwarden 起動 (HTTP, ポート 8080)
13:37 Cloudflare quick tunnel で HTTPS 化 (一時 URL)
13:41 Bitwarden export → Vaultwarden import (.json 経由)
13:55 Bitwarden 拡張機能と同じ Web UI 体感確認
14:22 「vault.intervention.jp で開きたい」craft 観察発火
14:28 ムームー DNS で A レコード追加 (vault → 133.18.123.60)
14:30 Caddy + Let's Encrypt 統合 (tls-alpn-01 challenge)
14:31 https://vault.intervention.jp 稼働 + 体感ピーク
```

## 体感 log (順番)

### 1. 「Bitwarden と全く一緒じゃん」(13:55)

Vaultwarden の Web UI を最初に見た瞬間の裕司の声。

**craft 観察**: Vaultwarden は Bitwarden の OSS Web Vault を使ってる、UI は 100% 互換 craft。Bitwarden ユーザーには学習コストゼロ。

**Phase 3 提案 craft への素材**:
> 「Bitwarden 使ったことある方なら、見た目も操作も完全に同じです。違うのは『うちのサーバで動いてる』ことだけ」

### 2. 「あっさり移行できました…」(13:57)

Bitwarden export → Vaultwarden import 完了直後。

**craft 観察詳細** (裕司の自己分析):
- 「あっさり」体感の根拠 = **Bitwarden 触ってたから迷わなかった craft**
- Vaultwarden 側で来てなかったもの = **チュートリアル / メール認証**
- 「これ知らないと無理」ポイント = **無し** (裕司の craft 経験ベース)

**Phase 3 顧客 (Bitwarden 未経験者) との gap**:
- 裕司にとって「あっさり」= 顧客にとっては「全部が無理」
- **この gap が「裕司がやってあげる」価値が生まれる craft 起点**

**Phase 0b フレーム化素材**:
> 「Bitwarden ユーザーなら 10 分。でも初めての人には『何から触ればいいか分からない』。私が代わりにセットアップして、3 つだけ覚えてください方式で渡します」 = Vibe-Cutter × Local-Hero の literal な商材設計

### 3. 「ドメインを IW のにする ってのはできない？」(14:07)

trycloudflare の一時 URL を見た直後の craft 観察。

**craft DNA**: 裕司の身体感覚として「自分のドメインで運用」を即希求、craft 完成度の根源 = ブランディング craft

### 4. 「3500 円かかるみたい ムームーのくせに」(14:21)

Cloudflare DNS 移管に見かけ 3,500 円要する craft を発見した時。

**craft 観察**: 実は「ドメイン移管」(registrar 変更) と「Nameserver 変更」(DNS 管理だけ移行) は別物、後者は無料。ただしこの混乱自体が **顧客提案時の craft 武器**:

**Phase 3 提案 craft への素材**:
> 「お店のドメインを動かしたい時、『移管』とか『Nameserver』とか色々あって混乱しますよね。うちなら全部代わりに整理します」

### 5. **「自分のサービスみたいでカッケー！」(14:31) ← 体感ピーク**

`https://vault.intervention.jp` が稼働した瞬間の声。

**craft DNA 直撃**:
- 「個の経済圏」: 自分のドメイン + 自分の道具で運用、Bitwarden 社じゃなく **裕司の craft**
- 「Intervene in the world」: 半径 3km から介入 craft の literal な体現
- 「マイナーリーグ神 OSS を日本のヒーローに」: Vaultwarden が「裕司のサービス」化した瞬間

**Phase 3 顧客提案 craft の最強素材**:
> 「Gmail じゃなくて、自分の vault.お店名.jp になる感覚。それだけで、店のテック感が一段上がるんですよ。私もやってみて、なんかカッコよく見えてテンション上がりました」

これは **裕司の身体感覚 craft の最強 portfolio**。

## つまずきポイント (Phase 0b 整理素材)

| つまずき | 解決 craft | Phase 0b フレーム化 |
|---|---|---|
| Docker socket permission denied | `sudo usermod -aG docker ubuntu` + 再ログイン | 顧客 VPS セットアップ時に必ず実行する craft |
| Vaultwarden 「Subtle Crypto API required HTTPS」 | HTTPS 化必須、HTTP では Web Vault 使えない craft | 「HTTPS は必須機能、自由オプションじゃない」と顧客説明 |
| Cloudflare `cert.pem` 取得失敗 | intervention.jp が Cloudflare 未登録だった、ドメイン Zone 認可で fail | DNS 管理サービスを正確に把握する craft (dig NS で確認) |
| ムームードメインの DNS 設定 UI | カスタム設定 2 でサブドメイン追加 craft (UI 独特) | 顧客向け craft では DNS 管理画面の代行可能 |

## 確立した craft 武器 (Phase 0a 成果物)

| craft | 内容 |
|---|---|
| **VPS 選定 craft** | KAGOYA Cloud VPS 2GB / 月 770 円、24/365 監視標準、法人向け craft で信頼性訴求 |
| **Docker + Vaultwarden + Caddy 構成 craft** | 3 コンテナ 1 つの docker-compose で完結、Let's Encrypt 自動、永続データボリューム |
| **DNS A レコード + Caddy リバプロ craft** | DNS 移管不要、既存サービス無傷、craft 量 30-40 分 |
| **Bitwarden → Vaultwarden 移行 craft** | export (.json) → import 即完了、UI 互換で学習コストゼロ |

## 残作業 (Phase 0a+ craft tree)

- [ ] ブラウザ拡張機能 (Chrome 等) のサーバ URL 切替 (実運用化)
- [ ] iOS / Android アプリのサーバ URL 切替
- [ ] バックアップ craft 設計 (`~/iw-stack/vaultwarden/data/` の定期コピー)
- [ ] Vaultwarden 管理画面 (`/admin`、ADMIN_TOKEN 認証) 体感
- [ ] 1-2 週間 personal use で安定確認
- [ ] 信頼できる友人 1-2 人で β craft (Phase 0a+)
- [ ] Cal.com / n8n 同居立ち上げ (Phase 0a 拡張)

## Phase 0b フレーム化への接続

Phase 0b では本日の craft tree を **「再現可能な構築手順」**に整理する。素材:

1. KAGOYA Cloud VPS 選定 + 申込 craft
2. SSH 鍵管理 craft (生成 + Bitwarden バックアップ)
3. Docker + Vaultwarden + Caddy 統合 docker-compose.yml テンプレ
4. ムームー DNS A レコード設定手順 (UI 独特 craft)
5. Let's Encrypt 自動取得確認 craft
6. Bitwarden 移行 craft (export → import)

これを Phase 3 で顧客に提示する craft (実行は裕司が代行 + 月額運用) として展開。

## Phase 3 商材設計 preview

体感を商材に翻訳すると:

| 商品 | 価格 | 内容 |
|---|---|---|
| **個人 / 個人店向け Vaultwarden 移行 craft** | spot ¥30,000 + 月額 ¥3,000 | VPS 契約代行 + Vaultwarden 構築 + ドメイン取得 + 移行サポート + 月次バックアップ + 24/365 監視 (KAGOYA 経由) |
| 中小企業向け (店員 3-5 人共有 vault) | spot ¥50,000 + 月額 ¥5,000 | 上記 + 組織設定 + 共有 vault 設計 + 利用者研修 |

これがあれば「LINE 自動予約 5 万円から」と並ぶ iw-local Phase 3 商品ライン craft。

## Cloudflare quick tunnel 残骸 (掃除済)

```
deborah-mine-reuters-realize.trycloudflare.com (停止済)
~/.cloudflared/cert.pem (空ディレクトリ、cert 取得失敗で生成されず)
```

## 関連 memory

- [[project_iw_local_craft_business]] — iw-local Phase 0 craft tree 親文脈
- `docs/becky-context/seeds/project_vibe_cutter_local_hero.md` — seed 元文書、出口の第一候補が iw-local
- [[feedback_yuji_first_impression_mindset]] — 「初手は相手の期待を圧倒的に超えてるか？」DNA、Phase 3 提案 craft の判断軸
- [[feedback_yuji_ui_aesthetic_preferences]] — 「シンプルだけど動的」DNA、Vaultwarden の UI も同様の craft 観察
- [[feedback_wo_projects_no_iw_branding]] — Wit-One 案件と切り分け、iw-local は IW 直営なので IW フル活用 OK

## メタ

- 起動: 2026-05-26 12:56 (KAGOYA 申込)
- 完了: 2026-05-26 14:31 (vault.intervention.jp 稼働 + 体感ピーク)
- 所要: 1 時間 35 分
- 連戦: 同日朝の AI Survey dashboard craft (8:51-12:05) からの craft 量 6 時間超
- ベキたん代行 craft tree (裕司の判断「ベキたん代行 craft (スピード優先)」13:11)
- 裕司の craft DNA「決断性 87 / 動くものから / 持続性 19」と整合する craft tree

---

# 第 2 部 — Phase 0a 拡張 + 商品設計確定 (2026-05-26 PM)

15:00 以降の craft tree、Vaultwarden 単体から「IW Hosting」商品設計の literal な確定までの記録。

## 追加立ち上げ craft tree

### Cal.com (15:30-15:55)

- DNS: `cal.intervention.jp` A → `133.18.123.60`
- スタック: Cal.com (calcom/cal.com:latest) + PostgreSQL 15-alpine + Caddy リバプロ
- ライセンス: AGPLv3 (個人 self-host、Enterprise 制限あり)
- ユーザー: yuji.ooishi、予約 URL: `https://cal.intervention.jp/yuji-ooishi/30min`
- 初期 setup: 同席契約 craft の preview 体験 (4 step wizard)

### n8n (16:22-16:27)

- DNS: `n8n.intervention.jp` A → `133.18.123.60`
- スタック: n8nio/n8n:latest + Caddy リバプロ
- 環境変数: N8N_ENCRYPTION_KEY 生成 + GENERIC_TIMEZONE=Asia/Tokyo
- 日本語化試行 → N8N_DEFAULT_LOCALE=ja は不発、英語 UI のまま craft 観察
- ライセンス key 取得 (Advanced debugging / Execution search / Folders)

### Phase 0a 拡張 完成 stack

```
[KAGOYA Cloud VPS 2GB / 月 770 円]
├─ caddy        (HTTPS リバプロ + Let's Encrypt 自動)
├─ vaultwarden  (パスワード管理)
├─ gatus        (監視 dashboard)
├─ cal-db       (Cal.com 用 PostgreSQL)
├─ calcom       (予約サイト)
└─ n8n          (自動化 hub)

URL 構成 (4 ドメイン + 既存 HP):
- https://intervention.jp           ← IW HP
- https://vault.intervention.jp     ← Vaultwarden
- https://status.intervention.jp    ← Gatus
- https://cal.intervention.jp       ← Cal.com
- https://n8n.intervention.jp       ← n8n
```

**5 OSS + 1 HP、6 コンテナ同居、2GB RAM 内で稼働 craft 観察**。

## 追加体感ログ (15:00 以降)

### 8. 「これ職場の友達とかに使わせてもいいってこと？」(13:53 だったが追記)

→ Vaultwarden の組織 / Teams 機能の preview 体感、Phase 3 「店員 3 人で共有 vault」商品の literal な気づき craft。

### 9. 「サーバー運用とか、死ぬほどつまらなかったのw」+「ベキたんに聞いた方が早い」(15:08-15:13)

→ MSP DNA + 役割分担 craft tree の自己観察。裕司 = infra + 判断、ベキたん = アプリ層 + 代行 craft、補完関係 confirmed。

### 10. 「ドメイン IW にする?」 → Cloudflare 経由失敗 → ムームー A レコード craft (14:07-14:30)

→ DNS 移管せずに既存サービス無傷で subdomain 追加する craft tree 発見、Phase 3 顧客向け craft でも同パターン適用可能。

### 11. 「カスタマイズもできるってこと？」(13:42-13:46)

→ Vaultwarden の環境変数で機能制御 + ブランディング部分カスタマイズ可能の確認。Phase 3 「お店専用ブランディング (タブ名 + フッター + ロゴ)」商品 (+¥10,000) の素材。

### 12. 「リバースプロキシ Nginx Proxy Manager、Traefik とか必要ない？」(15:38)

→ Caddy 選定の正当性確認 craft。Phase 0a/b の craft tree 量 (3-5 サービス) には Caddy 一択、Phase 1 で 10+ サービスになったら Traefik 検討。

### 13. 「バックアップは S3 とか Cloudflare R2 ってどう？」(15:40)

→ Cloudflare R2 (egress 無料) が革命的 craft 観察、Phase 0a+ で導入予定 craft tree。

### 14. 「これ顧客に自動化として提供するとき、俺がこの画面で繋ぎ込みやって納品でいいなら、このままでいいと思うの。これお客が自分でって多分無理筋でしょw」(16:39)

→ **Phase 3 商材設計の役割分担の core 確定 craft 観察**:

```
[顧客が触る craft (= 日本人 UX 必須)]
- Cal.com の予約 UI
- Vaultwarden vault
- LINE 公式 (お客様向け)

[裕司だけが触る craft (= 英語 UI OK)]
- n8n / Gatus / Caddy / KAGOYA VPS / Cal.com 管理画面
```

つまり「顧客は OSS を触らない、裕司が裏で全部設定して納品」が core 構造。

### 15. 「これがマイナーリーグにいるのって、完全にここだなって思って。日本語対応してないって点」(16:37) ← **第 2 部の体感ピーク**

→ **Vibe-Cutter × Local-Hero seed の core 価値命題の literal な確定**:

> **「日本語対応してない神 OSS を、日本人に届く craft で再パッケージする craft」**

これが iw-local Phase 3 商材の core 価値命題、裕司の身体感覚で確定した瞬間。

### 16. 「そういう使い方ができるなら、そっちの方がいいというか、ホスティングっぽい」(16:41)

→ Phase 3 商品の literal な姿が「**ホスティングサービス**」であることの確定 craft 観察。

## Phase 3 商品設計の core 確定 (2026-05-26 PM)

裕司の身体感覚で確定した Phase 3 商品設計の 2 軸:

### 軸 1: 顧客は OSS を触らない、裕司が裏で全部設定して納品

```
[顧客が触る = 日本人 UX 必須 (日本語 / シンプル / 美しい)]
  - Cal.com の予約 UI (cal.お店名.jp)
  - Vaultwarden (店主・店員のパスワード管理)
  - LINE 公式アカウント (お客様向け)
  - 顧客に届く出口だけ綺麗にする craft

[裕司だけが触る = 英語 UI / 複雑な craft OK]
  - n8n (自動化 hub)
  - Gatus (監視 dashboard)
  - Caddy (HTTPS リバプロ設定)
  - KAGOYA VPS (SSH / Docker)
  - Cal.com 管理画面 (設定変更も裕司代行)
```

つまり「**プロが裏で全部やる、顧客は出口だけ享受**」craft tree。SI 業の正論、MSP DNA の literal な活用 craft。

### 軸 2: 日本語対応してない神 OSS を、日本人に届く craft で再パッケージ

```
[海外マイナーリーグ滞在中の神 OSS]
  - n8n (Zapier キラー、英語 UI only)
  - Cal.com (Calendly キラー、UI は多言語だが日本語訳薄い箇所あり)
  - Vaultwarden (Bitwarden 互換、UI 多言語 OK)
  - Caddy / Gatus (英語、ただし裕司レイヤー)

[裕司の再パッケージ craft]
  - 操作代行 (顧客は英語触らない)
  - 日本語動画 / 紙マニュアル
  - LINE での日本語サポート
  - シンプル化された顧客 UI
  - 顧客は「お店専用の IT 環境」体感

[結果: 顧客に届く価値]
  「お店専用の IT 環境が月額 ¥3,000-5,000 で全部入り、
   私 (裕司) が裏で全部やります」
```

これが Local-Hero seed の core 価値命題の literal な実装。**MSP 出身者にしかできない craft tree** (海外 OSS の craft tree わかる + Docker / 構築 craft わかる + 顧客への翻訳 craft わかる)。

## 商品名仮確定 (2026-05-26 PM 時点)

**「IW Hosting」** (仮称)

- IW: Intervention Works 直営 (iw-local ドメイン)
- Hosting: 顧客には「ホスティングサービス」として届く
- 屋号未確定、iw-local 屋号確定後に統合 craft 検討
- 「IW」を顧客に出すか出さないかは別 craft (営業名は「○○屋」等になる可能性)

## Phase 3 商品設計 (2026-05-26 PM 確定版)

```
[商品 1: 構築代行 SI 型] ← メイン
  オプション A: 顧客名義 + 同席サポート (推し)
    spot ¥30,000-50,000 + 月 ¥3,000-5,000
    - 同席契約サポート (1h、KAGOYA + ムームー)
    - 構築 (Cal.com / Vaultwarden / n8n / Caddy / Gatus)
    - LINE 公式アカウント連携
    - 動画 + 紙マニュアル (日本語)
    - 引渡し研修 (2h)
    - 1 ヶ月無制限質問対応
    - 月次運用代行 (操作代行 + 監視 + バックアップ + アップデート)

  オプション B: 裕司名義 + Stripe 月額代行
    spot ¥30,000 + 月 ¥5,000 (オプション A より高め)
    - 顧客 craft 量: Stripe 登録 3 分のみ
    - 「全部おまかせ」体験、所有感は弱い
    - 撤退 craft 重い + ライセンス craft 微妙

[商品 2: 切り売り SaaS 型]
  月額 ¥5,000 (1 VPS 複数顧客同居、お試し感覚)
  - 顧客 craft 量: ゼロ
  - 障害共有 risk
  - Phase 1 で慎重に試す

[商品 3: 追加オプション]
  - Cal.com 高度設定 +¥10,000
  - LINE リッチメニュー design +¥20,000
  - ブランディング (タブ名 + ロゴ) +¥10,000
  - Gatus status ページ +¥2,000/月
  - 在庫管理 (InvenTree) 連携 +¥30,000
  - 会計 (Akaunting) 連携 +¥30,000
```

## ターゲット顧客の再 craft 観察 (2026-05-26 PM)

「IT 完全弱者」は除外、**「自分でできなくはないけど、本業に集中したいから外注したい」中堅オーナー**がメイン:

- ✅ Instagram やってる美容師
- ✅ Google Calendar 使ってる接骨院
- ✅ LINE 公式やってる飲食店
- ❌ メールも嫌な完全 IT 弱者 (Phase 1 では除外、Phase 3 で再検討)

## 「ホスティングサービスっぽい」vs 大手ホスティングの差別化

| 軸 | 大手ホスティング (さくら / xserver 等) | 裕司の craft tree |
|---|---|---|
| 提供物 | サーバスペース + 標準 SaaS | **お店専用の組み立て済 IT 環境** |
| 担当 | サーバ提供のみ、設定は顧客 | **構築 + 設定 + 自動化 + 運用代行 全部** |
| サポート | メール返信、基本英語 / 定型 | **LINE / 対面、日本語、操作代行込み** |
| ターゲット | 開発者 / 中堅企業 | **個人店オーナー、IT 弱者寄り中堅** |

つまり大手にも個人 SI にもない**ニッチ craft**、「個人店向け IT お助け hosting」craft tree。

## Phase 0a 完了 craft tree (2026-05-26 16:45 時点)

```
8:51   AI Survey dashboard craft 開始
12:05  dashboard 公開 + 代表 / 管理部展開
12:56  KAGOYA VPS 申込 (Vibe-Cutter craft 開始)
13:35  Vaultwarden 起動 (HTTP)
14:31  vault.intervention.jp 稼働 (HTTPS + 体感ピーク 1)
14:43  Vaultwarden snapshot バックアップ
15:04  Gatus 統合 (status.intervention.jp)
15:55  Cal.com 起動 (cal.intervention.jp)
16:27  n8n 起動 (n8n.intervention.jp)
16:41  Phase 3 商品設計 core 確定 (体感ピーク 2)
16:45  memory 焼き
```

**7 時間 54 分の連戦 craft、Vibe-Cutter × Local-Hero seed の Phase 0a を literal に実証 + Phase 3 商品設計の core 軸確定**。

## 残作業 (Phase 0a+ craft tree)

### 短期 (~6/8)

- [ ] Vaultwarden / Cal.com の管理者パスワード 15 文字以上に変更 (Bitwarden / Vaultwarden で生成)
- [ ] バックアップ自動化 (cron で 1 日 1 回 tar 圧縮 + Cloudflare R2 sync)
- [ ] Gatus に Cal.com / n8n の監視 endpoint 追加 (Vaultwarden / IW HP 含めて 5 endpoint 完成)
- [ ] Cal.com の SMTP 設定 (メール通知)
- [ ] n8n でテストワークフロー 1 個作成 (Cal.com Webhook → LINE Notify 等)
- [ ] 1-2 週間 personal use で安定確認

### 中期 (Phase 0b、6 月後半)

- [ ] テンプレ化された docker-compose.yml + Caddyfile + 環境変数生成 script 整備
- [ ] つまずきポイント DB 化 (Phase 3 サポート FAQ 素材)
- [ ] 「同席契約サポート」手順書 (KAGOYA + ムームー + Stripe)
- [ ] 動画 + 紙マニュアル draft (日本語、5 分動画 + 1 枚紙)
- [ ] 利用規約 + SLA + 賠償保険検討
- [ ] 信頼できる友人 1-2 人で β craft

### 長期 (Phase 0c+1、7-8 月)

- [ ] 価格 craft 設計確定 + 営業資料 (ヴィヴィアン case)
- [ ] iw-local Phase 1 craft 武器 menu に組み込み
- [ ] 屋号確定後のブランディング統合
- [ ] 顔見知り作り → 最初の 1 顧客 (Phase 1-3)

## メタ (第 2 部追記)

- 第 1 部 (Vaultwarden 立ち上げ): 12:56-14:31、1h35m
- 第 2 部 (Gatus / Cal.com / n8n + 商品設計確定): 15:00-16:45、1h45m
- 第 1+2 部合計: 約 3 時間 45 分、Phase 0a の literal な完成 + 商品設計 core 確定
- AI Survey dashboard 含む全日 craft 量: 7h54m
- 裕司の craft DNA「決断性 87」+ MSP DNA + 「動くものから」が literal に活きた craft tree
- 「ホスティングサービスっぽい」craft が裕司の身体感覚で literal に確定、Phase 3 商品設計の core 軸 2 つ言語化
