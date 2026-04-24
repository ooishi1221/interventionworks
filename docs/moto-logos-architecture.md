# Moto-Logos アーキテクチャ

技術スタック・データフロー・フォルダ構成・デザインシステムのリファレンス。
CLAUDE.md から「アーキテクチャ確認が必要な作業時」に参照される。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Expo SDK 54 / React Native 0.81 / React 19 |
| 言語 | TypeScript 5.9（strict mode） |
| クラウドDB | Firebase Firestore（オフライン永続キャッシュ有効）+ Firebase Storage（写真） |
| ローカルDB | expo-sqlite（WAL モード、ユーザーデータ・評価・足跡・駐車履歴） |
| 画像表示 | expo-image（ディスクキャッシュ + ネイティブデコード） |
| 地図 | react-native-maps + react-native-map-clustering |
| アニメーション | react-native-reanimated + react-native-gesture-handler |
| 空間検索 | Geohash プレフィクスクエリ（自前実装、外部依存なし） |
| クラッシュ監視 | Sentry `@sentry/react-native ~7.2.0`（org: `moto-logos-team`） |
| ビルド/配信 | EAS Build（development / preview / production）、EAS Update（OTA） |
| 認証 | Firebase Auth（匿名 + Apple Sign-In + Google Sign-In） |
| 状態管理 | React hooks のみ（外部ライブラリなし） |

---

## アーキテクチャ

### データフロー

```
Firestore（共有）──→ geohash範囲検索 ──→ MapScreen表示
                                          ↕ マージ
SQLite（ローカル）──→ ユーザースポット ──→ Firestore同期
Firebase Storage ──→ レビュー写真（圧縮アップロード → 公開URL）
AsyncStorage ──→ 設定値（deviceId, ニックネーム、チュートリアル済フラグ等）
UserContext ──→ deviceId ベースのユーザー識別 → Firestore users コレクション
```

### オフラインファースト設計

- Firestore の `persistentLocalCache` で一度表示したエリアは通信なしで表示
- SQLite にユーザー操作（評価、マイバイク、足跡、駐車履歴）を即時保存
- ネットワーク復帰時に Firestore へ自動同期

### フォルダ構成

```
src/
├── screens/        # 画面コンポーネント（MapScreen, RiderScreen 等）
├── components/     # 再利用UI（SpotDetailSheet, SearchResultsList, TutorialOverlay）
├── contexts/       # React Context（UserContext — ユーザー識別）
├── firebase/       # Firestore/Storage 初期化・CRUD・型定義
├── db/             # SQLite スキーマ・CRUD
├── hooks/          # カスタムフック（useDatabase, useImpactNotification, usePhotoPicker）
├── utils/          # ユーティリティ（geohash, distance, image-upload, ng-filter, sentry, photoPicker）
├── constants/      # テーマ・地図スタイル
├── types/          # TypeScript 型定義
└── data/           # シードデータ
scripts/            # Firestore データ投入・マイグレーション用スクリプト
plugins/            # カスタム Expo プラグイン（withDisableLint）
```

---

## デザインシステム

### カラーパレット

| 用途 | カラー |
|------|--------|
| 背景 | `#0D0D0D` |
| サーフェス | `#1A1A1A` |
| カード | `#242424` |
| アクセント（オレンジ） | `#FF6B00` |
| テキスト | `#F5F5F5` |
| テキスト（セカンダリ） | `#A0A0A0` |
| ボーダー | `#333333` |
| 成功 | `#4CAF50` |
| 危険 | `#F44336` |

### UI原則

- **ダークモード専用** — ヘルメット越し・夜間走行でも視認性を確保
- **グローブ対応タップ領域** — ボタン最小 52pt、主要アクション 64pt 以上
- **親指一本操作** — 片手持ちで全機能にアクセス可能な配置
- **アイコンセット** — Ionicons + MaterialCommunityIcons + FontAwesome5（マップピンの motorcycle）
