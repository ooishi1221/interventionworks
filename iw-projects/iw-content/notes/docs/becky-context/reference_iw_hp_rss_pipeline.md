---
name: IW HP の note RSS パイプライン
description: intervention.jp（WordPress + SWELL + ムームーサーバ）に note の最新記事を自動表示する仕組み。SimplePie の strip_htmltags 問題を mu-plugin で解決した 2026-05-08 の構築記録
type: reference
originSessionId: 6e94ba8f-5dea-4712-b59d-3de6e3f7d648
---
# IW HP × note RSS 自動連携パイプライン

**確立**: 2026-05-08 夕〜夜
**経路**: 木曜 20:00 自動公開の note 記事 → SWELL `loos/rss` ブロック → intervention.jp の Voice セクションに最新 3 件自動表示

---

## 構成

| 層 | 実装 |
|---|---|
| サーバ | ムームーサーバー（GMO ペパボ）|
| WP | WordPress + SWELL（loos）テーマ |
| RSS ブロック | SWELL の `loos/rss`（コア `core/rss` ではない）|
| Feed URL | `https://note.com/intervention_jp/rss` |
| 表示位置 | TOP 固定ページ（post=2）の Voice セクション |
| キャッシュ救済 | `wp-content/mu-plugins/iw-rss-fix.php`（必須）|

---

## 詰まりやすいポイント — 2026-05-08 のハマリ実例

**症状**: SWELL `loos/rss` で `note RSS` を指定 → フロントが「**フィードに記事が見つかりませんでした**」のまま固定。

**切り分け確定済み（無実なもの）**:
- ✅ note 側 RSS は curl で正常配信（`豆腐メンタル...` item 確認済み）
- ✅ サーバ → 外部 HTTPS（WP.org RSS は同じブロックで完璧表示）
- ✅ SWELL ブロック自体（テスト URL では表示成功）
- ✅ サーバ WAF（切っても変化なし）
- ✅ SWELL の useCache 切替（OFF→ON 戻し標準手順は効かない）

**真因**: WP 同梱の SimplePie が note の RSS を **strip_htmltags でゼロアイテム判定** していた。
note RSS の description は CDATA + リッチ HTML（H2 / blockquote / strong 多用）。SimplePie のデフォルト strip 設定だと中身全消去 → item 0 件として処理。

---

## 解決コード（mu-plugin）

`wp-content/mu-plugins/iw-rss-fix.php`（ローカル: `engineering/iw-hp-wp/mu-plugins/iw-rss-fix.php`）

ポイント:

```php
add_filter( 'wp_feed_options', function( $feed ) {
    $feed->set_timeout( 30 );           // ムームー外部 HTTPS は遅め
    $feed->set_useragent( '...WordPress' ); // 一部サーバーは UA 不在を弾く
    $feed->strip_htmltags( false );    // ★これが効いた、note の救済点
}, 10, 1 );
```

加えて「ツール → IW: RSS 診断」管理画面ページ（同 mu-plugin 内）で:
1. `wp_remote_get` の生 HTTP 結果（HTTPコード/Content-Type/Encoding/body 先頭）
2. `fetch_feed` (SimplePie) の item count + title + SimplePie エラー
3. `_transient_feed_*` の transient 一覧と削除トリガー

→ 同種症状再発時に **30 秒で原因特定**できる診断装置を兼ねる。

---

## 運用ルール

- **mu-plugin は消さない**: filter 部分は他 RSS でも汎用的に効く保険、診断ページも温存
- **診断ページは公開しない**: `manage_options` capability で管理者のみ
- **新 RSS 入れる時の最初の挙動チェック**: ツール → IW: RSS 診断 で URL 入れて 1 回テスト → これで 90% の問題は事前に見える

---

## How to apply

- 同種の RSS 取り込み問題に遭遇したら、まず `iw-rss-fix.php` がアップロードされてるか確認
- 別 RSS で「フィードに記事が見つかりませんでした」が出たら、診断ページに URL 入れて切り分け
- 上記 filter をテーマの functions.php に直書きしない（テーマ更新で消える、mu-plugin で永続化）

## 関連 memory

- `project_voice_of_becky.md`（並行 B 対外発信、note 第 1 弾 + IW HP 反映）
- `reference_note_publishing_via_chrome.md`（note 投稿フロー）
- `reference_witone_directory.md`（リポジトリ構造、`engineering/iw-hp-wp/` の位置）
