// 非表示タブではポーリングしない共通ヘルパ。
//
// 経緯（2026-07-28）: Vercel の Edge Request が無料枠 1M/月 の 96% に到達。
// 原因は開きっぱなしの作戦本部で、/room だけで JSON 11 本 × 60 秒 = 約 1.6 万 req/日、
// 30 日で 50 万を消費していた（fetchJson が `?t=` を付けるので CDN キャッシュも効かない）。
// 見ていない時間のリクエストが大半なので、そこを止める。
//
// タブに戻った時は間隔を待たずに即取得するため、体感の鮮度は変わらない。
window.pollVisible = function (fn, ms) {
  let last = Date.now();
  const run = () => { last = Date.now(); fn(); };
  const tick = () => { if (!document.hidden && Date.now() - last >= ms) run(); };
  setInterval(tick, Math.min(ms, 30000));
  document.addEventListener('visibilitychange', tick);
};
