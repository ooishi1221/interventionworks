import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..", "..");

const logPath = process.env.X_TWEET_LOG_PATH
  ? process.env.X_TWEET_LOG_PATH.startsWith("/")
    ? process.env.X_TWEET_LOG_PATH
    : join(projectRoot, process.env.X_TWEET_LOG_PATH)
  : join(projectRoot, "tweet-log.jsonl");

export type Speaker = "becky" | "yu";

export interface LogEntry {
  timestamp: string;
  speaker: Speaker;
  text: string;
  tweetId: string | null;
  reply_to: string | null;
  dry_run: boolean;
}

export function logTweet(entry: LogEntry): void {
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(logPath, line, "utf-8");
}

// JST日付文字列(epoch+9hのUTC変換)。post-tweet-cli.mjsのgetTodayCount()と同じ方式に揃える。
// UTC日付でstartsWith比較すると、JST朝の投稿(UTC前日夜)が「今日」から漏れて予算が無効化される
// (2026-07-22 team-lead特定: 7/19 18:20 / 7/20 12:44 の予算超過の真因)。
function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function getTodayTweetCount(): number {
  if (!existsSync(logPath)) return 0;
  const content = readFileSync(logPath, "utf-8");
  const today = jstDate(Date.now());
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  let count = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (!entry.dry_run && jstDate(new Date(entry.timestamp).getTime()) === today) {
        count += 1;
      }
    } catch {
      // skip malformed line
    }
  }
  return count;
}

export function getRecentTweets(limit = 5): LogEntry[] {
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const entries: LogEntry[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      entries.push(JSON.parse(line) as LogEntry);
    } catch {
      // skip malformed line
    }
  }
  return entries;
}
