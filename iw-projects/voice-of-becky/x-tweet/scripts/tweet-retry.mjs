/**
 * tweet-retry.mjs — 非冪等な client.v2.tweet() の安全なリトライロジック
 *
 * 429/5xx はレスポンスが届かなかっただけで投稿自体は成立してることがある。
 * リトライ前に直近ツイートと本文一致を1回だけ確認し、既に投稿済みなら
 * リトライせず（＝二重投稿を避けて）成功扱いで返す。
 *
 * post-tweet-cli.mjs から分離しているのは、mock client を注入してテストするため。
 */

export const RETRYABLE_CODES = [429, 500, 502, 503];

export function normalize(s) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

// 429 はレートリミットreset時刻まで待つ（twitter-api-v2 が x-rate-limit-reset ヘッダーを
// err.rateLimit.reset(epoch秒) に載せてくれる時だけ使う。無ければ固定バックオフにフォールバック）
export function retryDelayMs(err, attemptIndex) {
  if (err?.code === 429 && err?.rateLimit?.reset) {
    const waitMs = err.rateLimit.reset * 1000 - Date.now();
    if (waitMs > 0) return Math.min(waitMs + 500, 30000); // 上限30秒、待ちすぎない
  }
  return 2000 * (attemptIndex + 1); // 2s, 4s（従来の固定バックオフ）
}

let cachedUserId = null;
export function _resetDedupCacheForTest() {
  cachedUserId = null;
}

// 直近5分以内の自分のツイートに同一本文があれば「既に投稿済み」とみなしIDを返す
export async function findRecentDuplicate(client, text) {
  try {
    if (!cachedUserId) {
      const me = await client.v2.me();
      cachedUserId = me.data.id;
    }
    const timeline = await client.v2.userTimeline(cachedUserId, {
      max_results: 5,
      "tweet.fields": ["created_at"],
    });
    const target = normalize(text);
    const fiveMinAgoMs = Date.now() - 5 * 60 * 1000;
    for (const t of timeline?.tweets ?? []) {
      const createdMs = t.created_at ? new Date(t.created_at).getTime() : 0;
      if (createdMs < fiveMinAgoMs) continue;
      if (normalize(t.text) === target) return t.id;
    }
    return null;
  } catch {
    return null; // 確認できなければ従来通りリトライへ進む（過検知より見落とし優先）
  }
}

export async function tweetWithRetry(client, text, opts, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await client.v2.tweet(text, opts);
    } catch (err) {
      if (i === retries || !RETRYABLE_CODES.includes(err?.code)) throw err;
      const dupId = await findRecentDuplicate(client, text);
      if (dupId) return { data: { id: dupId, deduped: true } };
      await new Promise((r) => setTimeout(r, retryDelayMs(err, i)));
    }
  }
}
