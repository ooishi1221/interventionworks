import * as dotenv from "dotenv";
import { TwitterApi } from "twitter-api-v2";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const c = new TwitterApi({
  appKey: process.env.X_API_KEY!,
  appSecret: process.env.X_API_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
});

const tweetId = process.argv[2] ?? "2053309286995185840";
console.log(`=== Tweet ${tweetId} ===`);
try {
  const tweet = await c.v2.singleTweet(tweetId, {
    expansions: ["author_id", "in_reply_to_user_id"],
    "tweet.fields": [
      "created_at",
      "author_id",
      "in_reply_to_user_id",
      "referenced_tweets",
    ],
    "user.fields": ["username", "name"],
  });
  console.log(JSON.stringify(tweet, null, 2));
} catch (err) {
  console.error(
    "singleTweet failed:",
    err instanceof Error ? err.message : err
  );
}
