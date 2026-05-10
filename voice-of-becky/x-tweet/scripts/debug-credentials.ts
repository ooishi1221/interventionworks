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

console.log("=== Authenticated user (c.v2.me) ===");
try {
  const me = await c.v2.me();
  console.log(JSON.stringify(me.data, null, 2));
} catch (err) {
  console.error("me() failed:", err instanceof Error ? err.message : err);
}

console.log("\n=== intervention_jp by username ===");
try {
  const u = await c.v2.userByUsername("intervention_jp");
  console.log(JSON.stringify(u.data, null, 2));
} catch (err) {
  console.error(
    "userByUsername failed:",
    err instanceof Error ? err.message : err
  );
}
