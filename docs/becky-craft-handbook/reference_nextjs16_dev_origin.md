---
name: Next.js 16 の allowedDevOrigins 罠（cross-origin dev resource ブロック）
description: Next.js 16 から dev server リソースへの cross-origin アクセスが default でブロック。Tailscale / LAN IP 経由でアクセスすると JavaScript が壊れる。next.config.ts に allowedDevOrigins 設定が必須
type: reference
originSessionId: 44dd8dfd-b01f-4d25-b107-b3a630d2e195
---
Next.js 16 から **dev server の HMR / webpack リソースへの cross-origin アクセスを default でブロック**するセキュリティ機能が入った。Tailscale / LAN IP / 別マシンからのアクセスでハマる。

**症状:**

- 初回ページ表示はできる
- が、JavaScript bundle / HMR resource fetch が「Blocked cross-origin request」で弾かれる
- 結果: ボタン押しても反応しない、フォーム送信が走らない、React state 更新されない、debug log すら表示されない
- ブラウザ console に `Blocked cross-origin request to Next.js dev resource /_next/...` 警告

**修正:**

`next.config.ts`（or `.js`）に `allowedDevOrigins` 配列を追加:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['100.86.242.55', '192.168.68.53'],
}

export default nextConfig
```

→ dev server 再起動が必要（HMR では反映されない）。

**いつ踏むか:**

- Mac mini / リモート機で Next.js dev server 起動
- 別マシン / iPhone / iPad から Tailscale / LAN IP 経由でアクセス
- production build (`next build && next start`) では関係ない（dev server 専用の制約）

**プロジェクト固有メモ:**

- Voice of Becky `voice-of-becky/web/next.config.ts` に設定済み（2026-05-07）
- KUROKO / Moto-Logos / Slight でも同じ罠を踏む可能性あり（Mac mini で開発 → 別端末から確認時）
