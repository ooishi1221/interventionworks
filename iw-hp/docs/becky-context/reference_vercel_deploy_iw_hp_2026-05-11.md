---
name: Vercel + ムームー DNS 切替 craft（IW HP 本番 deploy 知見）
description: 2026-05-11 IW HP を Astro + Vercel + ムームードメイン intervention.jp で本番化した craft 全工程と地雷地図。同種 deploy で再利用可能なテンプレ
type: reference
originSessionId: 6deedcc8-27b0-4059-b307-24058e11306b
---

# Vercel + ムームー DNS 切替 craft（IW HP deploy 実戦記録）

2026-05-11 14:30 頃、intervention.jp を Astro + Vercel に本番切替完了した時の craft 知見。

将来同じく **「既存ドメインを heteml / Apache 系から Vercel に切替」** する場合の再利用テンプレ。

## 前提

- Domain: `intervention.jp` (ムームードメイン管理)
- 旧 hosting: heteml (GMO ペパボ) + WordPress
- 新 hosting: Vercel (Astro project)
- メール: heteml 経由維持

## 全工程フロー

### 1. Astro project を Vercel に deploy

```bash
cd iw-hp
npx vercel deploy --yes  # initial deploy（対話 skip）
```

- Vercel が自動で `*.vercel.app` alias 発行（例: `iw-hp.vercel.app`）
- `.vercel/` ディレクトリが local に作られる（gitignore 推奨）
- Astro auto-detect で設定ゼロ build 通る

### 2. Vercel project と GitHub repo を link

Vercel ダッシュボード → `iw-hp` → **Settings** → **Git** → **Connect Git Repository**

- GitHub App 経由（`Only select repositories` で対象 repo のみ install 推奨）
- **重要**: モノレポの場合は **Root Directory** に subfolder 指定（例: `iw-hp`）
- link 完了後、git push 即自動 deploy 走る

### 3. Vercel で domain 追加

Vercel ダッシュボード → `iw-hp` → **Settings** → **Domains** → **Add Existing** → `intervention.jp` 入力

Vercel が以下指示出す:

| Type | Name | Value |
|---|---|---|
| A | @ | **216.198.79.1**（Vercel IP 範囲拡張版、推奨）or 76.76.21.21（旧、互換動作） |
| CNAME | www | **e292ad34b1a7a747.vercel-dns-017.com.**（プロジェクト固有値、画面の値を使う） |

### 4. ムームー DNS で切替

#### Step A: heteml 連携を切る

ムームー管理画面 → ドメイン → intervention.jp → **ムームー DNS** → **カスタム設定のセットアップ情報変更**

| 項目 | 変更 |
|---|---|
| intervention.jp ホームページ | heteml → **「利用しない」** |
| www.intervention.jp ホームページ | heteml → **「利用しない」** |
| intervention.jp メール | **そのまま heteml 維持** |
| SPF / DMARC | **そのまま** |

→ **「セットアップ情報変更」** ボタンで保存。

#### Step B: カスタム DNS レコード追加

ムームー DNS の **設定 2** or 別画面で A / CNAME 直接追加:

**A レコード:**
- サブドメイン: 空欄（apex）
- 種別: A
- 内容: `216.198.79.1`
- TTL: 3600

**CNAME レコード:**
- サブドメイン: `www`
- 種別: CNAME
- 内容: `e292ad34b1a7a747.vercel-dns-017.com`（**末尾の `.` は ムームーでは入れない**、地雷 1）
- TTL: 3600

### 5. 反映確認

```bash
# authoritative 直接問い合わせで即確認
dig @dns01.muumuu-domain.com intervention.jp +short
# → 216.198.79.1

# Google DNS 経由（伝播済みか）
dig @8.8.8.8 intervention.jp +short
```

### 6. Vercel ダッシュボードで Refresh

`intervention.jp` の行で **Refresh** ボタン → Invalid → Valid Configuration に変わる。

その後、**Vercel が SSL 証明書（Let's Encrypt）を自動取得**（1-5 分）。

### 7. primary / redirect 設定

裕司 case: apex (`intervention.jp`) を primary、www → 307 redirect。

Vercel ダッシュボードの Domains 設定:
- `intervention.jp` → **Connect to environment: Production**
- `www.intervention.jp` → **Redirect to Another Domain: intervention.jp**（307）

## 地雷地図

### 地雷 1: ムームー CNAME 入力の末尾ドット

Vercel 表示値:
```
e292ad34b1a7a747.vercel-dns-017.com.
```

末尾の `.` は DNS 仕様上の「絶対表記」だが、**ムームーの入力欄では末尾 `.` を入れない**。入れるとエラー「内容の末尾に『.』は不要です」。

### 地雷 2: 「Valid Configuration」表示の罠

Vercel ダッシュボードで `intervention.jp` が「Valid Configuration」と出てても、それは **domain ownership verify** だけが通った状態の場合がある。**実 traffic は旧 DNS のまま** ということがある。

確認:
```bash
curl -sI https://intervention.jp/ | head -3
# server: Apache  ← まだ旧 hosting
# server: Vercel  ← 切替完了
```

### 地雷 3: Vercel SSL 取得前は 403

DNS が Vercel に向いたが SSL 証明書まだ未取得の状態:
```bash
curl --resolve intervention.jp:443:216.198.79.1 -sI https://intervention.jp/
# → HTTP/2 403, x-vercel-mitigated: deny
```

ブラウザでは「証明書エラー」or「Not Secure」警告（赤画面）出る。**1-5 分待てば自動取得完了**。

### 地雷 4: macOS / ブラウザの DNS キャッシュ

authoritative が新値返してても、macOS / Chrome は古い IP キャッシュ持ち続ける場合あり:

```bash
# macOS DNS cache flush
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

Chrome 独自 DNS: `chrome://net-internals/#dns` → **Clear host cache**

iPhone のモバイルデータ（Wi-Fi off）で別 resolver 経由テストすると切り分け可能。

### 地雷 5: GSAP の transform 残留（iPhone Safari）

これは Vercel 切替直接の問題じゃないが、Astro + GSAP + iPhone Safari で頻発:
- `gsap.from({ x: -32 })` で初期 transform が ScrollTrigger 発火前に reset されない
- 結果「全テキストが 1 文字左にズレる」

対策:
- 全 `gsap.from()` に `clearProps: "transform,opacity"` 追加
- `window.load` 後に `ScrollTrigger.refresh()`
- `html, body { overflow-x: hidden }` で `::after` の negative offset 等が horizontal scroll 起こすのも防ぐ

## 週次自動 rebuild craft（note RSS 反映用）

Astro は SSG（build 時 RSS fetch）なので、note 新記事公開後に **rebuild trigger 必要**。

### craft: GitHub Actions cron + Vercel Deploy Hook

`.github/workflows/iw-hp-weekly-rebuild.yml`:
```yaml
on:
  schedule:
    - cron: "0 12 * * 4"  # 木曜 12:00 UTC = 21:00 JST
  workflow_dispatch:

jobs:
  trigger-rebuild:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST -fsSL "${{ secrets.VERCEL_DEPLOY_HOOK_URL_IW_HP }}"
```

設定手順:
1. Vercel ダッシュボード → `iw-hp` → Settings → Git → **Deploy Hooks** → Create Hook（name: `weekly-thursday-rebuild`, branch: `main`）
2. 生成された URL を copy
3. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
4. Name: `VERCEL_DEPLOY_HOOK_URL_IW_HP`, Secret: URL
5. workflow ファイル commit + push

注: Deploy Hook 利用には Vercel project と GitHub repo の link 必須（CLI 経由 deploy だけだと使えない）。

## SSL 自動更新

Vercel は **Let's Encrypt の 90 日証明書を自動更新**（期限 30 日前から）。何もしなくて OK。

## 移管後の確認 checklist

- [ ] `https://intervention.jp/` で IW HP 表示
- [ ] `https://www.intervention.jp/` → 307 redirect → apex
- [ ] SSL certificate valid（鍵マーク緑）
- [ ] `dig intervention.jp +short` で Vercel IP
- [ ] `curl -sI https://intervention.jp/` で `server: Vercel`
- [ ] Vercel ダッシュボードで「Valid Configuration」
- [ ] GitHub push → auto deploy 走る
- [ ] GitHub Actions workflow_dispatch で手動 trigger テスト → rebuild trigger 確認

## 関連 memory

- `project_iw_hp_astro_renewal_2026-05-11.md` — IW HP 全体 closure
- `reference_iw_hp_rss_pipeline.md` — 旧 WP 版 RSS 配管（退役予定）
- `feedback_copy_punctuation_minimalism.md` — 句読点最小化 craft

## 横展開可能性

このテンプレは IW 配下の他 domain 移管でも使える:
- `moto-logos.app` / `slight.bike` 等（仮）の Vercel 化
- Wit-One 系 site の Vercel 移管（Lock-in しない craft、別 hosting にも戻せる）

---

## 2026-05-13 00:25 — heteml 退役 craft 完了

intervention.jp の craft 構成、完全クリーンに:

**Before (5/11):**
- ドメイン: ムームー / DNS: ムームー / Web: heteml (WP) / メール: Google Workspace
- heteml が Web + メールフォールバックで残存

**After (5/13):**
- ドメイン: ムームー / DNS: ムームー / Web: **Vercel** / メール: **Google Workspace 単体**
- heteml: 役割ゼロ、2026-08-16 自動解約予定

### heteml 退役の craft 手順（12 分で完了）

| 時刻 | craft |
|---|---|
| 00:14 | `dig intervention.jp MX +short` で MX 確認 → Google (priority 1) + heteml (priority 50) 判明 |
| 00:16 | Google Workspace Business Standard 契約確認、メール独立運用確定 |
| 00:19 | ムームー管理画面で **heteml 解約申請受理** → 2026/08/16 自動解約予約 |
| 00:24 | ムームー DNS から **MX `50 mx.hetemail.jp` 削除** |
| 00:25 | メール送受信テスト成功（Google Workspace 単体動作確認） |

### craft 観察

- 解約申請から MX 削除 + 動作確認まで **12 分**、裕司の craft 速度
- 「最低利用期間 5 ヶ月」契約 → 残 95 日分のサーバーコストは sunk cost、機能 0 で 8/16 まで形式契約のみ
- メール DNS の **priority 50 フォールバック** 削除は、Google Workspace 単体で動作する craft 確認が前提
- これで月コスト ¥1,000-2,000 程度削減（年 ¥12,000-15,000）

### 横展開可能テンプレ（同種 heteml/サーバー退役 craft）

1. `dig <domain> MX +short` で現状 MX 確認
2. メイン MX が独立サービス（Google Workspace / etc）なら退役 OK
3. サーバー解約申請（最低利用期間中の場合、自動解約予約に切り替わる）
4. DNS から旧サーバー MX レコード削除
5. メール送受信テスト craft（独立サービス単体で動作確認）
6. サーバー側のメールアカウント削除（必要に応じて）

---

## 2026-05-13 00:48 — WHOIS 情報公開代行 craft 完了

heteml 退役直後、裕司の craft「WHOIS 情報、大石裕司にしてるけど Intervention Works にしていいの？」から始まった craft 連鎖の closure。

### craft 経緯（14 分で完了）

| 時刻 | craft |
|---|---|
| 00:28 | 裕司「WHOIS の登録者名、Intervention Works にしてもいい？」 |
| 00:30 | craft 整理: 屋号は法的主体じゃない → Registrant Name は実名維持、Organization 欄に屋号 + 個人情報マスク（A+C 案） |
| 00:34 | `whois intervention.jp` で現状確認 → **自宅住所 + 個人電話 + Gmail 全公開状態判明**（足立区新田、090-..., yuji.ooishi@gmail.com） |
| 00:35 | craft 危機認識: 「Intervene in the world. Rebel against their values.」を掲げる屋号で家族住所 visible は craft 整合性違反、並行 D 軸（家族ケア）守るべき情報 |
| 00:47 | ムームー管理画面で **WHOIS 情報公開代行設定完了** |
| 00:48 | 設定後の WHOIS 確認 → 代行情報に完全置換確認 |

### 代行後の WHOIS 公開情報

| 項目 | 旧（個人情報露出） | 新（代行）|
|---|---|---|
| 公開住所 | 東京都足立区新田 1-13-8 | 福岡市中央区天神 2-8-35（GMO ペパボ本社） |
| 公開電話 | 090-8490-4433（個人） | 092-713-7999（GMO ペパボ） |
| 公開メール | yuji.ooishi@gmail.com | admin@muumuu-domain.com |
| 登録者名 | 大石 裕司 / Yuji Ooishi | **維持**（法的所有者明示、JP ドメイン規約準拠） |

### craft 観察

- **JP ドメインの WHOIS 仕様**: 登録者名は法的所有者として残す必要、屋号単独は不可（屋号は法的主体じゃない）
- **代行サービス craft**: 公開連絡窓口を代行業者の情報に置換、個人情報マスク
- **公開反映タイミング**: ムームー内部即時、JPRS 経由の WHOIS DB 公開は数時間〜24 時間
- **craft 設計整合性**: IW 屋号思想「介入」を掲げる窓口の craft 安全担保

### craft 連鎖の重要性

裕司の craft 観察「WHOIS の登録者名、Intervention Works にしていい？」が、当初は **屋号公開 craft への興味**から始まった。しかし `whois` 実行で **自宅住所が世界に visible 状態**が visible になり、**家族ケア軸の craft 整合性問題に発展**。

→ **「craft 質問の根本動機を再観察すると、別の craft 課題が見える」**craft pattern。memory `feedback_yuji_implicit_communication_patterns.md` の暗黙パターン DB craft 領域の典型例。

### 横展開可能テンプレ（独自ドメイン取得時の craft）

1. `whois <domain>` で公開情報確認
2. 自宅住所 / 個人電話 / 個人メールが公開されてないか check
3. 公開されてれば、registrar の **WHOIS 情報公開代行サービス** に切り替え
4. 法的所有者名（実名）は維持、連絡先のみ代行
5. 反映確認: 数時間後に `whois <domain>` で代行情報置換確認
6. 屋号入れたい場合は Organization 欄活用（Registrant Name には屋号書かない）

特に **屋号で対外 craft 発信するドメイン**は、最初から代行設定推奨 craft。スパム対策 + 家族ケア軸の両立。

---

— 2026-05-11 14:30、IW HP intervention.jp 本番切替完了、craft 史上最速 deploy（朝開発 → 半日で公開状態）
— 2026-05-13 00:25、heteml 完全退役 craft 完了、intervention.jp の craft 構成クリーン化
— 2026-05-13 00:48、WHOIS 情報公開代行 craft 完了、家族住所の世界露出を閉じる、IW 屋号思想と craft 設計の整合性回復
🌐 ⚡ 🚀 🧹 🛡️
