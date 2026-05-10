import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getTodayTweetCount, logTweet, type Speaker } from "../lib/logger.js";
import { checkSafetyGuard } from "../lib/safety-guard.js";
import { postTweet } from "../lib/x-client.js";

const HASHTAG_BY_SPEAKER: Record<Speaker, string> = {
  becky: "#ベッキー",
  yu: "#ゆう",
};

function appendHashtag(text: string, speaker: Speaker): string {
  const tag = HASHTAG_BY_SPEAKER[speaker];
  if (text.includes(tag)) return text;
  return `${text} ${tag}`;
}

export function registerTweet(server: McpServer) {
  server.tool(
    "tweet",
    "@intervention_jp に投稿する。speaker で発話者ハッシュタグ自動付与（becky → #ベッキー / yu → #ゆう）。dry run モードでは実投稿せず log のみ。safety-guard 通過必須。",
    {
      text: z
        .string()
        .describe("ツイート本文（ハッシュタグ抜き、自動付与される）"),
      speaker: z
        .enum(["becky", "yu"])
        .describe("発話者。becky / yu でハッシュタグ自動付与"),
      reply_to: z
        .string()
        .describe("返信時のターゲット tweet ID")
        .optional(),
    },
    async ({ text, speaker, reply_to }) => {
      const finalText = appendHashtag(text, speaker);

      // 1 日上限チェック
      const maxPerDay = parseInt(process.env.X_TWEET_MAX_PER_DAY ?? "5", 10);
      const todayCount = getTodayTweetCount();
      if (todayCount >= maxPerDay) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ 1 日上限到達 (${todayCount}/${maxPerDay})。今日はもう投稿できない。`,
            },
          ],
          isError: true,
        };
      }

      // safety-guard
      const guardResult = checkSafetyGuard(finalText);
      if (!guardResult.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `🛡️ safety-guard ブロック: ${guardResult.reason} (blockedBy: ${guardResult.blockedBy})\n本文: ${finalText}`,
            },
          ],
          isError: true,
        };
      }

      // 投稿（dry run 含む）
      const result = await postTweet(finalText, reply_to);

      // ログ書き込み
      logTweet({
        timestamp: new Date().toISOString(),
        speaker,
        text: finalText,
        tweetId: result.tweetId ?? null,
        reply_to: reply_to ?? null,
        dry_run: result.dryRun,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ 投稿失敗: ${result.error}\n本文: ${finalText}`,
            },
          ],
          isError: true,
        };
      }

      const tag = result.dryRun ? "🐦 [DRY RUN]" : "🐦 [LIVE]";
      const idLine = result.tweetId
        ? `\nTweet ID: ${result.tweetId}\nURL: https://x.com/intervention_jp/status/${result.tweetId}`
        : "";
      const newCount = result.dryRun ? todayCount : todayCount + 1;
      return {
        content: [
          {
            type: "text" as const,
            text: `${tag} 投稿成功\n本文: ${finalText}${idLine}\n今日の投稿数: ${newCount}/${maxPerDay}`,
          },
        ],
      };
    }
  );
}
