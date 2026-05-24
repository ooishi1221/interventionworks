# Canvas 階層設計 — 放置恋姫 ホーム画面

> 2026-05-03。Unity 6.3 LTS / Screen Space - Overlay Canvas 想定。
> 解像度ターゲット：縦画面 1080×2400（モダンスマホ標準）

## 全体階層

```
Canvas (Screen Space - Overlay)
├── BackgroundLayer                       ← 一番奥（戦闘演出が裏で勝手に動く）
│   └── BattleViewport (RawImage / 全画面)
│       ├── ParticleSystem_HitEffects
│       ├── DummyEnemyContainer
│       │   └── [動的 Spawn される Enemy インスタンス]
│       └── DummyPlayerContainer
│           └── PlayerSprite_x3 (味方武将のシルエット)
│
├── HeaderLayer (上端、高さ ~120px)
│   ├── HeaderBackground (半透明黒グラデ)
│   ├── VIPBadge (VIP3 表示、左端)
│   └── CurrencyBar (Horizontal Layout Group, 8 個並ぶ)
│       ├── Currency_Gold        (金貨)
│       ├── Currency_Silver      (銀貨)
│       ├── Currency_Diamond     (ダイヤ)
│       ├── Currency_Genpou      (元宝)
│       ├── Currency_Stone       (石)
│       ├── Currency_Key         (鍵)
│       ├── Currency_Shouken     (招集令)
│       └── Currency_Shinzui     (神髄)
│
├── LeftSidebar (左端、Vertical Layout Group)
│   ├── IconButton_01 (例: イベント告知)
│   ├── IconButton_02 (例: 限定ガチャ)
│   ├── IconButton_03 (例: 武将祈願)
│   ├── IconButton_04 (例: 七日福袋)
│   └── IconButton_05 (例: VIP 特典)
│
├── RightSidebar (右端、Vertical Layout Group)
│   ├── IconButton_06 (例: メールボックス)
│   ├── IconButton_07 (例: ギルド）
│   ├── IconButton_08 (例: 任務)
│   ├── IconButton_09 (例: チャージ)
│   └── IconButton_10 (例: ショップ)
│
├── FloatingPopupLayer (中央〜下、ランダム湧き)
│   └── (ScheduledPopup インスタンスが時々 Spawn される)
│
├── Footer (下端、高さ ~180px、Horizontal Layout Group)
│   ├── FooterButton_主城     (メインアイコン、最も大きい)
│   ├── FooterButton_武将
│   ├── FooterButton_ガチャ   (中央、装飾過多)
│   ├── FooterButton_バッグ
│   └── FooterButton_設定
│
└── DebugInfo (右下、小さい text)
    └── FPS / Build / Version 表示
```

## 配置数値

| 領域 | アンカー | サイズ | 補足 |
|---|---|---|---|
| HeaderLayer | top stretch | height: 120 | 半透明黒グラデで sigh of order |
| LeftSidebar | left stretch (vertical) | width: 80, top offset 140, bottom offset 200 | Vertical Layout Group |
| RightSidebar | right stretch (vertical) | width: 80, top offset 140, bottom offset 200 | Vertical Layout Group |
| Footer | bottom stretch | height: 180 | Horizontal Layout Group + 中央ボタン拡大 |
| BackgroundLayer | stretch all | full screen | Order in Layer: -1（UI 裏） |
| FloatingPopupLayer | center | dynamic | 時々ランダムにポップアップ |

## 各要素の構造

### Currency アイテム（HeaderLayer 配下）

```
Currency_Gold
├── Image (アイコン、24x24)
├── TMP_Text (数値、12pt 白)
└── [ + ] Button (右端の課金導線、装飾だけで非機能)
└── Component: CurrencyTicker.cs
```

### IconButton（Sidebar 配下）

```
IconButton_xx
├── Image (アイコン背景、64x64、装飾フレーム)
├── Image (アイコン、48x48)
├── TMP_Text (短いラベル、下、9pt)
├── Badge (右上、Image 赤丸 + TMP_Text 白)
│   └── Component: NotificationBadge.cs
└── Component: Button
```

### FooterButton

```
FooterButton_xx
├── Image (背景プレート、装飾過多)
├── Image (アイコン、80x80)
├── TMP_Text (ラベル、12pt 白縁取り)
├── Badge (右上、Image 赤丸 + TMP_Text 白)
│   └── Component: NotificationBadge.cs
├── ParticleSystem (キラキラエフェクト、低密度ループ)
└── Component: Button
```

### BattleViewport（BackgroundLayer 配下）

```
BattleViewport
├── Image (背景画像、城壁 / 草原 / 戦場)
├── ParticleSystem_HitEffects (Burst エフェクトプール)
├── DummyEnemyContainer
│   └── Enemy_01 .. Enemy_N (動的 spawn)
├── DummyPlayerContainer
│   ├── PlayerSprite_武将A
│   ├── PlayerSprite_武将B
│   └── PlayerSprite_武将C
└── Component: AutoBattleBackground.cs
```

## カラーパレット（中華放置擬態）

| 用途 | カラー | hex |
|---|---|---|
| ヘッダー BG | 深い赤紫 → 黒グラデ | #1A0A1A → #000000 |
| 通貨アイコン背景 | 暗い金 | #5A4920 |
| 通貨数字 | 白 + 縁取り金 | #FFFFFF / #FFD700 |
| バッジ赤 | 強い赤 | #E53E3E |
| バッジ数字 | 純白 | #FFFFFF |
| Footer 中央ボタン | 装飾金 | #FFD700 + glow |
| VIP ラベル | 紫金 | #9F7AEA |
| 期間限定文字 | 点滅赤 | #FF0000 ⇄ #FFFFFF |

## アニメーション仕様

| 要素 | アニメ |
|---|---|
| Header 通貨 | Update で数字インクリメント、桁繰り上がりで一瞬光る |
| Badge | scale 1.0 ⇄ 1.08 で軽く脈打つ（pulse 2.5Hz）|
| Footer 中央ガチャ | 常時 glow 呼吸（saturation pulse）|
| Sidebar アイコン | 一定間隔で「!」アイコンが点滅 |
| BattleViewport | 自動戦闘ループ + 0.5〜2 秒間隔でヒット |
| FloatingPopup | 30〜90 秒間隔でランダム湧き |

## 騒がしさの指標（POC 合否）

POC 起動 5 秒で以下を全て同時に体感できれば成功：

- [ ] 数字が複数箇所で増えてる
- [ ] 赤バッジが多数点滅
- [ ] 戦闘音 / 効果音 / BGM の重なり
- [ ] 期間限定の点滅 / 焦らせ
- [ ] 何をすればいいか即決まらない（情報過密）

これらが「うわ騒がしい」を構成する。
