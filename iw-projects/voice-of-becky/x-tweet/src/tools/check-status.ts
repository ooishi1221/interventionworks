import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getRecentTweets, getTodayTweetCount } from "../lib/logger.js";
import { getKillSwitchStatus } from "../lib/safety-guard.js";
import { isDryRun } from "../lib/x-client.js";

export function registerCheckStatus(server: McpServer) {
  server.tool(
    "check_status",
    "x-tweet クライアントの状態確認。dry run / 今日の投稿数 / kill switch 状態 / namelist サイズ / 直近 tweet を返す。",
    {},
    async () => {
      const dryRun = isDryRun();
      const killSwitch = getKillSwitchStatus();
      const maxPerDay = parseInt(process.env.X_TWEET_MAX_PER_DAY ?? "5", 10);
      const todayCount = getTodayTweetCount();
      const recent = getRecentTweets(5);

      const lines = [
        `🐦 x-tweet status`,
        `  Dry run:        ${dryRun ? "✅ ON" : "❌ OFF (LIVE)"}`,
        `  Today's posts:  ${todayCount}/${maxPerDay}`,
        `  EMERGENCY_STOP: ${killSwitch.emergencyStop ? "🛑 ACTIVE" : "OK"}`,
        `  PAUSE_UNTIL:    ${killSwitch.pauseUntil ?? "-"}`,
        `  Namelist:       ${killSwitch.namelistEntries} entries`,
        ``,
      ];

      if (recent.length > 0) {
        lines.push(`Recent tweets (last ${recent.length}):`);
        for (const t of recent) {
          const truncated =
            t.text.length > 60 ? `${t.text.slice(0, 60)}...` : t.text;
          lines.push(
            `  [${t.timestamp.slice(0, 19)}] ${t.speaker} ${
              t.dry_run ? "(dry)" : "(live)"
            } ${truncated}`
          );
        }
      } else {
        lines.push(`Recent tweets: (まだなし)`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    }
  );
}
