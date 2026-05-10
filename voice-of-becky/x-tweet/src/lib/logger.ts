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

export function getTodayTweetCount(): number {
  if (!existsSync(logPath)) return 0;
  const content = readFileSync(logPath, "utf-8");
  const today = new Date().toISOString().slice(0, 10);
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  let count = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.timestamp.startsWith(today) && !entry.dry_run) {
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
