# seed: iw-local 店舗HP + CMS 構成

2026-06-02 メモ

## コンセプト

個人店向けに HP 作成 + コンテンツ更新の仕組みをセットで提供。
テンプレート1本で安価に提供、カスタマイズが必要な場合は独立提供（別料金）。

## 技術構成（クレア判定済み）

- **フロント**: Next.js（Vercel deploy）、`/app/[tenant]/page.tsx` で店舗 ID によりコンテンツ切替
- **CMS**: Directus（OSS）を KAGOYA VPS に Docker Compose で自前ホスト
- **HTTPS**: Caddy（自動証明書）

Strapi は非推奨。マルチテナントのネイティブ権限分離がなく、店舗オーナーに管理画面を渡すと他店データが見えるリスクがある。

## Directus コレクション設計（最小）

```
stores      : id / slug / name / theme_color / logo_url
menu_items  : id / store_id / name / price / image_url
store_pages : id / store_id / section / body (Rich Text)
```

## 店舗追加オペレーション

1. Directus 管理画面で `stores` レコード追加（5分）
2. コンテンツ入力（オーナー自身でも可）
3. ドメイン設定（サブパスならゼロ、独自ドメインなら15分）

コード変更・再デプロイ不要。

## 注意点

**初期構築時に Directus の PUBLIC ロール権限を必ず絞る。**
デフォルトは全データパブリック読み取り可能。後回し厳禁。

## ステータス

seed 段階。最初の1店舗で動かしながら設計を固める順序が正解。
