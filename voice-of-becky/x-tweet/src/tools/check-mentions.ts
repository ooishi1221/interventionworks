import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getMentions } from "../lib/x-client.js";

export function registerCheckMentions(server: McpServer) {
  server.tool(
    "check_mentions",
    "@intervention_jp 宛の最新メンション・リプライを取得する。返り値の tweet ID を tweet ツールの reply_to に渡せばリプ返信できる。",
    {
      since_id: z
        .string()
        .describe("これより新しい tweet のみ取得（ページング・未読管理用）")
        .optional(),
      max_results: z
        .number()
        .min(5)
        .max(100)
        .describe("取得件数（5-100、デフォルト 10）")
        .optional(),
    },
    async ({ since_id, max_results }) => {
      try {
        const mentions = await getMentions({
          sinceId: since_id,
          maxResults: max_results,
        });

        if (mentions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `📭 メンションなし${since_id ? ` (since_id: ${since_id} 以降)` : ""}`,
              },
            ],
          };
        }

        const lines = [
          `📬 ${mentions.length} 件のメンション${since_id ? ` (since_id: ${since_id} 以降)` : ""}`,
          ``,
        ];

        for (const m of mentions) {
          const truncated =
            m.text.length > 140 ? `${m.text.slice(0, 140)}...` : m.text;
          const authorLabel = m.authorName
            ? `@${m.authorUsername} (${m.authorName})`
            : `@${m.authorUsername}`;
          lines.push(
            `[${m.createdAt.slice(0, 19)}] ${authorLabel}`
          );
          lines.push(`  ${truncated}`);
          lines.push(`  ID: ${m.id}`);
          lines.push(`  URL: ${m.url}`);
          lines.push(``);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ メンション取得失敗: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
