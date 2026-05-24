/**
 * デバッグ用の Alert / ログを一括制御するスイッチ。
 *
 * 開発・調査時に true にすると以下が発火する:
 *   - MapScreen: fetchSpotsInRegion の結果 / エラーを Alert
 *   - SearchOverlay: chipPress のエラー詳細を Alert
 *
 * **β配布前は必ず false に戻すこと**。
 * 過去事例: 2026-04-20 に Places API 調査用に SearchOverlay へ
 *           デバッグ Alert を仕込んだまま CEO がβ実機で遭遇した。
 *
 * 個別フラグではなく単一のスイッチで管理するのは「全 OFF を1箇所で確認できる」ため。
 */
export const DEBUG_ALERT = false;
