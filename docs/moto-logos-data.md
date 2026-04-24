# Moto-Logos スポットデータ

Firestore スポットデータのソース・件数・投入スクリプト・拡充ロードマップ。
CLAUDE.md から「スポット投入スクリプト実行・データソース追加・ロードマップ確認時」に参照される。

---

## 概要

**Firestore 合計: 約1,306件**（首都圏 + 関東広域）

---

## データソース

| ソース | 件数 | IDプレフィクス | ライセンス | 内容 |
|--------|------|---------------|-----------|------|
| **実在確認済み** | 41件 | `real_` | — | 公式サイト・現地確認ベースの駐車場。住所・料金・台数・営業時間あり |
| **JMPSA公開情報** | 38件 | `jmpsa_` | — | 日本二輪車普及安全協会（https://www.jmpsa.or.jp/society/parking/）の公開データから手動転記。渋谷・新宿・千代田・豊島・港・中央区 |
| **OpenStreetMap** | 675件 | `osm_` | **ODbL** | Overpass API から `amenity=motorcycle_parking` を自動取得。名前あり23%、台数あり13%。ユーザーの足跡で情報が育つ設計 |
| **警察ガイド** | 552件 | `police_` | — | 都内オートバイ駐車場MAP 2024（東京都道路整備保全公社発行）。全件に名称・住所・台数・料金・IC決済。CC制限・営業時間もnotesから自動パース。OSM重複34件はマージ更新済み |

---

## OSM データ詳細

- **取得範囲:** 緯度 34.8〜36.9、経度 138.5〜140.9（東京・神奈川・埼玉・千葉 + 茨城・栃木・群馬・静岡・山梨・長野）
- **取得方法:** Overpass API（`node` + `way` の `amenity=motorcycle_parking`）
- **取得スクリプト:** `scripts/fetchOsmSpots.mjs`
- **重複排除:** 既存 real_/jmpsa_ スポットと50m以内の座標は自動除外
- **ライセンス義務:** アプリ内に `© OpenStreetMap contributors` のクレジット表記が必要（SettingsScreen に追加済み）
- **ODbL 条件:** 商用利用OK。OSMデータを含むデータベースを外部APIで公開する場合は同一ライセンス適用が必要
- **データ品質:** 名前・住所が空のスポットが多い。ユーザーが足跡を残す中で情報が補完されていく想定

---

## エリア別内訳（OSM分）

| エリア | 件数 |
|--------|------|
| 東京都 | 379 |
| 神奈川県 | 133 |
| 埼玉県 | 56 |
| 千葉県 | 45 |
| 茨城県 | 18 |
| 静岡県 | 17 |
| 山梨県 | 11 |
| 栃木県 | 8 |
| 群馬県 | 5 |
| 長野県 | 2 |

---

## 投入スクリプト

| スクリプト | 用途 | 実行コマンド |
|-----------|------|-------------|
| `scripts/fetchOsmSpots.mjs` | OSM から首都圏データ取得 → JSON 出力 | `node scripts/fetchOsmSpots.mjs` |
| `scripts/importRealData.mjs` | 実在79件の投入（ダミー削除 + 実データ投入） | `node scripts/importRealData.mjs` |
| `scripts/bulkImport.mjs` | 汎用 JSON → Firestore バッチ書き込み | `node scripts/bulkImport.mjs --file scripts/data/spots-osm-kanto.json` |
| `scripts/importPoliceGuide.mjs` | 警察ガイド588件 → 重複チェック + Firestore投入 | `node scripts/importPoliceGuide.mjs --dry-run` |
| `scripts/generateSpots.mjs` | ダミーデータ生成（開発用、本番非使用） | `node scripts/generateSpots.mjs` |

---

## データ拡充ロードマップ（都市集中戦略）

**方針:** 地方にデータを薄く広げない。都市部のデータ密度を上げ、「開けば必ず見つかる」体験を保証する。拡張は都市間横展開。

| Phase | ソース | 想定件数 | 状態 |
|-------|--------|---------|------|
| ~~Phase 0~~ | ~~実在確認 + JMPSA手動転記~~ | ~~79件~~ | **完了** |
| ~~Phase 1~~ | ~~OpenStreetMap（Overpass API）~~ | ~~675件~~ | **完了（2026-04-14）** |
| ~~Phase 1.5~~ | ~~警察配布バイク駐車場ガイド（PDFスキャン→OCR）~~ | ~~552件~~ | **完了（2026-04-17）** — 588件OCR→ジオコーディング→552件新規投入+34件OSMマージ |
| Phase 2 | 横浜市・川崎市・さいたま市の自治体オープンデータ（CC BY 4.0） | 数百件 | 未着手 — 東京23区は警察ガイドで充足。次は周辺政令指定都市の密度を上げる |
| Phase 3 | s-park（東京都道路整備保全公社）提携 | 580場 | 未着手 — 二輪駐車場 + リアルタイム満空情報。β反響次第で交渉開始 |
| Phase 4 | JMPSA 正式データ提携 | 15,300件（首都圏） | 未着手 — akippa前例あり。β反響次第で交渉開始 |
| Phase 5 | 大阪・名古屋・福岡へ都市間横展開 | 数千件 | 未着手 — 首都圏で勝ってから |
