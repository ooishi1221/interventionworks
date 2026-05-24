---
name: Slight が IW 内独立 launch context として始動
description: 2026-04-26、Slight CF Phase 1 始動に合わせて interventionworks/slight/ を独立 launch context 化。Moto-Logos と同居から分離。
type: project
originSessionId: 4d664cfd-bdb8-4306-b261-b779ec70ae73
---
Slight は引き続き `/Volumes/SSD2TB/interventionworks/` 内に置きつつ、**Moto-Logos とは別の launch context** として運用開始（2026-04-26）。CF Phase 1 が動き出すため、Slight 集中作業時には `slight/` 直下で Claude を立ち上げる前提。

**Why:**
- Slight CF Phase 1（5,000円 / 300個 / 14日 50% 凍結）が始動
- Moto-Logos の存在証明思想と Slight の Zero-Resistance 思想を、launch 時に混ぜないため
- wit-one/KUROKO/ で確立した「Hub + 独立 launch context」パターンとの対称性

**How to apply:**
- Slight に集中: `/Volumes/SSD2TB/interventionworks/slight/` で立ち上げ → `slight/CLAUDE.md` が auto load
- IW 横断: `/Volumes/SSD2TB/interventionworks/` で立ち上げ → IW Hub CLAUDE.md
- Moto-Logos アプリ実装: `engineering/moto-logos/` 等で立ち上げ
- 記憶は launch 場所に依らず canonical へ symlink 統合済（Slight 関連も同じプール）
- Slight 固有のビジュアル仕様・ブランドボイスは `slight-brand` スキル（変更なし）

**ディレクトリ構成:**
```
interventionworks/slight/
├── CLAUDE.md          # 判断軸 + 動線
├── docs/
│   ├── cf/            # CF ページ仕様・販促
│   ├── packaging/     # パッケージ（車検証ケース化）
│   └── manufacturing/ # ファブレス製造・サンプル
├── reference/         # PDF 資料・サンプル写真置き場
└── design/            # CF ページ実装（後日）
```

**位置づけ:**
- Slight 単体の成功 / 失敗を超えて、**Wit-One の D2C 伴走コンサル営業エビデンス**作りが本当の狙い
- KUROKO（AI Ops 受託）と並ぶ、Wit-One の新事業ピッチ素材
