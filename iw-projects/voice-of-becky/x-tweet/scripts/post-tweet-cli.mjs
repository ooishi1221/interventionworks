#!/usr/bin/env node
/**
 * post-tweet-cli.mjs — observer が subprocess で呼ぶ 1-shot tweet poster
 *
 * Usage:
 *   node scripts/post-tweet-cli.mjs "ツイート本文"
 *   node scripts/post-tweet-cli.mjs "ツイート本文" --reply-to <tweet_id>
 *
 * 成功: exit 0 + stdout に tweet ID
 * 失敗: exit 1 + stderr にエラー
 * 上限: exit 2 + stderr に LIMIT メッセージ
 */

import { readFileSync, appendFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { tweetWithRetry } from "./tweet-retry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

// .env 手動ロード（dotenv なしで動く）
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [k, ...rest] = trimmed.split("=");
    if (!process.env[k]) process.env[k] = rest.join("=");
  }
}

const { TwitterApi } = await import("twitter-api-v2");

// 引数パース: "本文" [--reply-to <id>]
const args = process.argv.slice(2);
const text = args[0];
const replyToIdx = args.indexOf("--reply-to");
const replyTo = replyToIdx !== -1 ? args[replyToIdx + 1] : null;
const imageIdx = args.indexOf("--image");
const imagePath = imageIdx !== -1 ? args[imageIdx + 1] : null;
const formatIdx = args.indexOf("--format");
const format = formatIdx !== -1 ? args[formatIdx + 1] : "monologue";

if (!text) {
  process.stderr.write("Usage: post-tweet-cli.mjs <text> [--reply-to <tweet_id>] [--image <path>]\n");
  process.exit(1);
}

const maxPerDay = parseInt(process.env.X_TWEET_MAX_PER_DAY ?? "5", 10);
const logPath = resolve(__dirname, "../tweet-log.jsonl");

// 今日の投稿数（JST）
function getTodayCount() {
  if (!existsSync(logPath)) return 0;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let count = 0;
  for (const line of readFileSync(logPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.dry_run) continue;
      const jstDate = new Date(new Date(e.timestamp).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (jstDate === today) count++;
    } catch {}
  }
  return count;
}

const todayCount = getTodayCount();
if (todayCount >= maxPerDay) {
  process.stderr.write(`LIMIT: ${todayCount}/${maxPerDay}\n`);
  process.exit(2);
}

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

try {
  const tweetOptions = replyTo
    ? { reply: { in_reply_to_tweet_id: replyTo } }
    : {};

  if (imagePath && existsSync(imagePath)) {
    const imgBuffer = await readFile(imagePath);
    const mimeType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const mediaId = await client.v1.uploadMedia(imgBuffer, { mimeType });
    tweetOptions.media = { media_ids: [mediaId] };
  }

  const result = await tweetWithRetry(client, text, tweetOptions);
  const tweetId = result.data.id;

  appendFileSync(
    logPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      speaker: "becky",
      text,
      tweetId,
      reply_to: replyTo ?? null,
      dry_run: false,
      format,
    }) + "\n"
  );

  process.stdout.write(tweetId);
  process.exit(0);
} catch (err) {
  process.stderr.write(`ERROR: ${err?.message ?? err}\n`);
  process.exit(1);
}
