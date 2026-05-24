# Prefab 配置案 — 放置恋姫 ホーム画面 POC

> 2026-05-03。Unity 6.3 LTS 想定。Unity Editor で手動構築する Prefab の構造ガイド。

## Prefab 一覧

| Prefab | 用途 | 主要コンポーネント |
|---|---|---|
| `BadgePrefab` | 赤バッジ（通知件数表示）| Image, TMP_Text, NotificationBadge.cs |
| `EnemyPrefab` | 戦闘背景のダミー敵 | RectTransform, Image, (任意) HP Bar |
| `HitEffectPrefab` | 討伐時のヒットエフェクト | ParticleSystem |
| `IconButtonPrefab` | Sidebar の小型アイコンボタン | Button, Image, TMP_Text, Badge child |
| `CurrencyItemPrefab` | Header の通貨1個分 | Image, TMP_Text, CurrencyTicker.cs |
| `FooterButtonPrefab` | Footer の主要ボタン | Button, Image, TMP_Text, Badge child, ParticleSystem |
| `FloatingPopupPrefab` | 時々ランダム湧きする煽りポップアップ | Image, TMP_Text, Button(close) |

---

## 1. BadgePrefab

```
BadgePrefab
├── (root) RectTransform: 28x28
├── Image (Source: Knob, color: #E53E3E, type: Sliced)
│   └── 円形（Border でラディアル）
├── TMP_Text (anchor: center, size: 14, color: white, font weight: Bold)
│   └── Text: "1"
└── Component: NotificationBadge.cs
    ├── countText → 自分の TMP_Text
    ├── pulseTarget → 自分の RectTransform
    ├── currentCount: 1
    ├── minIntervalSec: 1.5
    ├── maxIntervalSec: 5.0
    └── pulseAmplitude: 0.08
```

**配置:** 親オブジェクトの右上。anchor (1, 1)、pivot (1, 1)、anchored position (-4, 4)。

---

## 2. EnemyPrefab

```
EnemyPrefab
├── (root) RectTransform: 60x60
├── Image (Source: Square, color: #888888 ランダム調整推奨)
└── (任意) HPBar
    ├── Image (BG: #333)
    └── Image (Fill: #FF0000)
```

**注:** 中華放置の擬態だけが目的なので、シンプルな図形で十分。後で AI 生成キャラ画像に差し替え。

---

## 3. HitEffectPrefab

```
HitEffectPrefab
├── (root) Transform
└── ParticleSystem
    ├── Duration: 0.5
    ├── Start Lifetime: 0.3〜0.6
    ├── Start Speed: 2〜5
    ├── Start Size: 0.2〜0.5
    ├── Start Color: 黄〜橙のグラデ
    ├── Emission > Bursts: Count 8〜15 / Time 0.0
    ├── Shape: Sphere
    └── Renderer: Default Particle Material
```

**注:** UI Particle じゃなく World Space Particle を Canvas の裏側に置く。または `ParticleImage` 系のアセットがあれば UI 上で。

---

## 4. IconButtonPrefab

```
IconButtonPrefab
├── (root) RectTransform: 64x64, Image (frame, Source: Border, color: 暗金)
├── Background Image (アイコン背景: 黒半透明)
├── Icon Image (アイコン本体: 48x48)
├── Label (TMP_Text, anchor: bottom, size: 9, color: white)
│   └── Text: "限定"
├── Badge (BadgePrefab を child としてインスタンス化)
└── Component: Button
    └── (onClick: 何もしない、装飾だけ)
```

**配置:** Sidebar 配下に Vertical Layout Group で 5 個並べる。spacing: 12px。

---

## 5. CurrencyItemPrefab

```
CurrencyItemPrefab
├── (root) RectTransform: 110x40, Image (frame: 暗金)
├── Icon Image (24x24, anchor: left)
├── ValueText (TMP_Text, size: 12, color: white, outline 金)
│   └── Text: "12,847"
├── PlusButton (16x16, Image: +アイコン, anchor: right)
├── GlowOverlay (CanvasGroup, alpha: 0、桁繰り上がりで光る)
└── Component: CurrencyTicker.cs
    ├── valueText → 自分の ValueText
    ├── glowGroup → GlowOverlay
    ├── currentValue: 12,847（種類ごとに調整）
    └── incrementPerSecond: 17（種類ごとに調整、例：金貨 17 / ダイヤ 0.3）
```

**配置:** Header 配下の CurrencyBar に Horizontal Layout Group で 8 個並べる。spacing: 6px。

### 通貨ごとの incrementPerSecond 推奨値

| 通貨 | initialValue | incrementPerSecond | 補足 |
|---|---|---|---|
| 金貨 | 12,847 | 17.0 | 大量に増える、目を引く |
| 銀貨 | 84,392 | 32.0 | 最大量 |
| ダイヤ | 1,234 | 0.3 | 高級感、ゆっくり |
| 元宝 | 5,840 | 1.2 | 中華系特有、中速 |
| 石 | 23,847 | 8.0 | |
| 鍵 | 47 | 0.05 | 希少感、ほぼ動かない |
| 招集令 | 128 | 0.1 | 武将ガチャ用 |
| 神髄 | 9,847 | 4.5 | |

→ 速度のばらつきが「情報過密」の核。

---

## 6. FooterButtonPrefab

```
FooterButtonPrefab
├── (root) RectTransform: 約 130x140
├── BackgroundPlate (Image: 装飾フレーム、Sliced)
├── Icon (Image: 80x80)
├── Label (TMP_Text, size: 12, color: white outline 金)
│   └── Text: "ガチャ"
├── Badge (BadgePrefab、右上)
├── ParticleSystem (低密度のキラキラループ、ガチャボタンのみ強め)
└── Component: Button
```

**注:** 中央のガチャボタンだけ scale 1.1〜1.15 で大きく、glow も強く。「課金導線が一番目立つ」業界擬態。

---

## 7. FloatingPopupPrefab

```
FloatingPopupPrefab
├── (root) RectTransform: 320x180, Image (装飾フレーム)
├── HeaderImage (画像、半身イラスト)
├── TitleText (TMP_Text, size: 18, color: 金 outline)
│   └── Text: "【限定】100連無料ガチャ開催中！"
├── BodyText (TMP_Text, size: 12, color: white)
│   └── Text: "あと 23 時間 47 分"
├── ConfirmButton (大きい)
├── CloseButton (小さい "×"、右上)
└── (任意) Component: 自動 close タイマー
```

**配置:** FloatingPopupLayer 配下に動的 spawn。30〜90 秒間隔でランダム。

---

## Scene 構築手順（裕司 + Editor で）

1. **新規 Scene** 作成: `Assets/Scenes/HomeScreen.unity`
2. **Canvas** 作成（GameObject → UI → Canvas）
   - Render Mode: Screen Space - Overlay
   - UI Scale Mode: Scale With Screen Size, Reference Resolution: 1080x2400, Match: 0.5
3. **EventSystem** 自動生成を確認
4. **BackgroundLayer / HeaderLayer / Sidebar / Footer / FloatingPopupLayer** を子オブジェクトとして配置（`canvas-hierarchy.md` 参照）
5. **Prefab 群** を `Assets/Prefabs/` に作成、配置
6. **Scripts** を `Assets/Scripts/` にコピー（unity-prep/scripts/ から）
7. **HomeScreenManager** 空オブジェクトに `HomeScreenController.cs` をアタッチ
8. **AutoBattleBackground** を BackgroundLayer/BattleViewport にアタッチ
9. **Play** で起動確認

---

## TMP（TextMeshPro）について

Unity 6.3 LTS では TextMeshPro は標準同梱。最初に **Window → TextMeshPro → Import TMP Essentials** を一度実行する必要あり。Scene に最初の TMP_Text を置こうとした時にダイアログが出る。

---

## 動作確認チェックリスト（POC 完成判定）

実機 / Editor Play で以下を 5 秒以内に体感できれば成功：

- [ ] 通貨数字 8 個が同時に増加してる
- [ ] バッジが複数箇所で点滅
- [ ] 戦闘背景でダミー敵がスポーン → 討伐ループ
- [ ] Footer 中央の「ガチャ」が一番目立つ
- [ ] BGM + 効果音が重なって「賑やか」（音は POC 後でも可）
- [ ] 何をすればいいか即決まらない（情報過密 = 成功）

5 秒で「うわ騒がしい」が伝われば、Phase 2 のフル実装に進む価値あり。
