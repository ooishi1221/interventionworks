#!/usr/bin/env node
/**
 * test-tweet-retry.mjs — tweet-retry.mjs の自己チェック（フレームワーク不要）
 * 実行: node scripts/test-tweet-retry.mjs
 */
import assert from "node:assert/strict";
import { tweetWithRetry, _resetDedupCacheForTest } from "./tweet-retry.mjs";

function fakeError(code, rateLimit) {
  const e = new Error(`fake ${code}`);
  e.code = code;
  if (rateLimit) e.rateLimit = rateLimit;
  return e;
}

// ケース1: 503で失敗後、実は投稿成立してた（重複あり）→ リトライせずスキップして既存IDを返す
async function testDuplicateSkipsRetry() {
  _resetDedupCacheForTest();
  let tweetCalls = 0;
  const client = {
    v2: {
      tweet: async () => {
        tweetCalls++;
        throw fakeError(503);
      },
      me: async () => ({ data: { id: "u1" } }),
      userTimeline: async () => ({
        tweets: [
          { id: "existing-123", text: "こんにちは世界", created_at: new Date().toISOString() },
        ],
      }),
    },
  };
  const result = await tweetWithRetry(client, "こんにちは世界", {}, 2);
  assert.equal(tweetCalls, 1, "重複検知後は再度 tweet() を呼ばない");
  assert.equal(result.data.id, "existing-123", "既存ツイートIDを返す");
  console.log("PASS: 重複はリトライせずスキップされる");
}

// ケース2: 本当に別内容 & タイムラインに一致なし → 通常通りリトライして最終的に成功
async function testDifferentContentRetries() {
  _resetDedupCacheForTest();
  let tweetCalls = 0;
  const client = {
    v2: {
      tweet: async () => {
        tweetCalls++;
        if (tweetCalls < 2) throw fakeError(503);
        return { data: { id: "new-456" } };
      },
      me: async () => ({ data: { id: "u1" } }),
      userTimeline: async () => ({
        tweets: [{ id: "unrelated-1", text: "別の内容だよ", created_at: new Date().toISOString() }],
      }),
    },
  };
  const result = await tweetWithRetry(client, "今日は新しいツイート", {}, 2);
  assert.equal(tweetCalls, 2, "重複が無ければ通常通りリトライする");
  assert.equal(result.data.id, "new-456");
  console.log("PASS: 内容が違えば普通にリトライされる");
}

// ケース3: 非リトライ対象コード（400等）は即throw
async function testNonRetryableThrowsImmediately() {
  _resetDedupCacheForTest();
  let tweetCalls = 0;
  const client = {
    v2: {
      tweet: async () => {
        tweetCalls++;
        throw fakeError(400);
      },
    },
  };
  await assert.rejects(() => tweetWithRetry(client, "壊れたリクエスト", {}, 2));
  assert.equal(tweetCalls, 1, "リトライ対象外コードは即失敗");
  console.log("PASS: リトライ対象外コードは即throw");
}

await testDuplicateSkipsRetry();
await testDifferentContentRetries();
await testNonRetryableThrowsImmediately();
console.log("ALL PASS");
