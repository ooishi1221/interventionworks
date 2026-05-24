import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGetCurrentTime(server: McpServer) {
  server.tool(
    "get_current_time",
    "Mac mini の現在時刻を取得。ベッキーが自分の時間軸を身体感覚として把握するための tool。返却: JST 時刻 + 曜日 + ISO 8601 + 時間帯ラベル（朝/昼/夕方/夜/深夜）。自律発信時の温度判定や、handoff の時系列錯覚を防ぐ目的で使う。",
    {},
    async () => {
      const now = new Date();
      const jstFormatter = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "long",
        hour12: false,
      });

      const parts = jstFormatter.formatToParts(now);
      const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "";
      const year = get("year");
      const month = get("month");
      const day = get("day");
      const hour = get("hour");
      const minute = get("minute");
      const second = get("second");
      const weekday = get("weekday");

      const hourNum = parseInt(hour, 10);
      let period: string;
      if (hourNum >= 5 && hourNum < 11) period = "朝";
      else if (hourNum >= 11 && hourNum < 15) period = "昼";
      else if (hourNum >= 15 && hourNum < 18) period = "夕方";
      else if (hourNum >= 18 && hourNum < 23) period = "夜";
      else period = "深夜";

      const lines = [
        `🕰️ 現在時刻 (Mac mini)`,
        `  JST:      ${year}-${month}-${day} ${hour}:${minute}:${second} (${weekday})`,
        `  ISO:      ${now.toISOString()}`,
        `  時間帯:    ${period}`,
        `  hour(24): ${hourNum}`,
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    },
  );
}
