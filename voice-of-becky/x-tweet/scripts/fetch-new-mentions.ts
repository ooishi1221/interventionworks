import * as dotenv from "dotenv";
import { TwitterApi } from "twitter-api-v2";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

const ROOT = join(__dirname, "..");
const LOGS_DIR = join(ROOT, "logs");
const STATE_FILE = join(LOGS_DIR, "last-seen-mention.txt");

if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

const c = new TwitterApi({
  appKey: process.env.X_API_KEY!,
  appSecret: process.env.X_API_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
});

let userId: string;
try {
  const me = await c.v2.me();
  if (!me.data?.id) throw new Error("c.v2.me() returned no id");
  userId = me.data.id;
} catch (err) {
  console.error(
    "[fetch-new-mentions] me() failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
}

const lastSeen = existsSync(STATE_FILE)
  ? readFileSync(STATE_FILE, "utf8").trim() || null
  : null;

const params: Record<string, unknown> = {
  max_results: 10,
  expansions: ["author_id"],
  "tweet.fields": ["created_at", "author_id"],
  "user.fields": ["username", "name"],
};
if (lastSeen) params.since_id = lastSeen;

let result;
try {
  result = await c.v2.userMentionTimeline(userId, params);
} catch (err) {
  console.error(
    "[fetch-new-mentions] userMentionTimeline failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
}

const tweets = result.tweets ?? [];

if (tweets.length === 0) {
  process.exit(0);
}

const usersMap = new Map<string, { username?: string; name?: string }>(
  (result.includes?.users ?? []).map((u) => [u.id, u])
);

// HinachanTV リビルド前（〜2026-05-09）の過去 mention を排除
// @intervention_jp としての活動開始日以降のみ拾う
const REBUILD_CUTOFF = new Date("2026-05-10T00:00:00Z");

const others = tweets.filter((t) => {
  if (t.author_id === userId) return false; // self-mention 除外
  if (!t.created_at) return false; // 不完全データ除外
  return new Date(t.created_at) >= REBUILD_CUTOFF; // 古い HinachanTV 時代を除外
});

if (others.length > 0) {
  for (const t of others) {
    const user = usersMap.get(t.author_id ?? "") ?? {};
    console.log(
      JSON.stringify({
        id: t.id,
        text: t.text,
        author_username: user.username ?? "",
        author_name: user.name ?? "",
        created_at: t.created_at ?? "",
        url: user.username
          ? `https://x.com/${user.username}/status/${t.id}`
          : `https://x.com/i/status/${t.id}`,
      })
    );
  }
}

writeFileSync(STATE_FILE, tweets[0].id);
