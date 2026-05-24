#!/usr/bin/env node
// Standalone notification script — works with both Webhook (simple) and Bot Token (interactive)
// Usage:
//   node notify.js "メッセージ"                          → simple text via webhook
//   node notify.js --interactive '{"question":"...","options":["A","B"]}'  → buttons via bot

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const args = process.argv.slice(2);
const isInteractive = args[0] === "--interactive";

async function sendBotMessage(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.error("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set");
    process.exit(1);
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text,
      username: "Claude Code",
      icon_emoji: ":zap:",
    }),
  });

  const result = await res.json();
  if (!result.ok) {
    console.error("Bot message failed:", result.error);
    process.exit(1);
  }
}

async function sendInteractive(payload) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.error("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set");
    process.exit(1);
  }

  const data = JSON.parse(payload);

  const buttons = data.options.map((opt, i) => ({
    type: "button",
    text: { type: "plain_text", text: opt },
    value: opt,
    action_id: `claude_choice_${i}`,
  }));

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      username: "Claude Code",
      icon_emoji: ":zap:",
      text: `⏳ ${data.question}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `⏳ *Claude が選択を待っています*\n\n${data.question}` },
        },
        {
          type: "actions",
          elements: buttons,
        },
      ],
    }),
  });

  const result = await res.json();
  if (!result.ok) {
    console.error("Bot message failed:", result.error);
    process.exit(1);
  }
}

if (isInteractive) {
  await sendInteractive(args[1]);
} else {
  await sendBotMessage(args.join(" "));
}
