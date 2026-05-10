#!/usr/bin/env node
/**
 * x-tweet MCP server — entry point
 *
 * 構成:
 *   - tweet            投稿 + safety-guard + dry run + ログ
 *   - check_status     状態確認（dry run / 今日の投稿数 / kill switch / namelist）
 *   - check_mentions   @intervention_jp 宛のメンション取得（リプ返信用）
 *
 * 将来追加候補:
 *   - delete_tweet
 *   - poll_mentions（launchd 常駐 polling）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { registerCheckMentions } from "./tools/check-mentions.js";
import { registerCheckStatus } from "./tools/check-status.js";
import { registerTweet } from "./tools/tweet.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

async function main() {
  const server = new McpServer({
    name: "x-tweet",
    version: "0.1.0",
  });

  registerTweet(server);
  registerCheckStatus(server);
  registerCheckMentions(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[x-tweet] MCP server running on stdio");
}

main().catch((error) => {
  console.error("[x-tweet] Fatal error:", error);
  process.exit(1);
});
