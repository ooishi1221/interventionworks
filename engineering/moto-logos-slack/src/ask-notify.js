#!/usr/bin/env node
/**
 * Claude Code の AskUserQuestion フックから呼ばれる。
 * $CLAUDE_TOOL_INPUT の質問内容を解析し、Slack にボタン付きで送信する。
 *
 * Usage: CLAUDE_TOOL_INPUT='{"question":"..."}' node ask-notify.js
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_CHANNEL_ID;

if (!token || !channel) {
  console.error("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set");
  process.exit(0); // フック失敗でClaude を止めない
}

// --- 質問テキストの抽出 ---
let question = "Claude が判断を求めています";
try {
  const raw = process.env.CLAUDE_TOOL_INPUT || "{}";
  const parsed = JSON.parse(raw);
  if (parsed.question) question = parsed.question;
} catch {
  // パース失敗 → デフォルトの質問テキストを使う
}

// --- 質問タイプに応じたボタン生成 ---
function detectButtons(text) {
  const lower = text.toLowerCase();

  // y/n 系
  if (/\(y\/n\)|\[y\/n\]|\[yes\/no\]/i.test(text)) {
    return [
      { text: "はい (Yes)", value: "yes" },
      { text: "いいえ (No)", value: "no" },
    ];
  }

  // Allow / Deny 系 (ツール実行許可)
  if (/allow|許可|permit/i.test(text)) {
    return [
      { text: "許可する", value: "yes" },
      { text: "拒否する", value: "no" },
    ];
  }

  // 選択肢がテキストに含まれている場合 (1. xxx 2. xxx)
  const numbered = text.match(/^\s*(\d+)[.)]\s+(.+)$/gm);
  if (numbered && numbered.length >= 2) {
    return numbered.slice(0, 5).map((line) => {
      const m = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
      return { text: m[2].trim().slice(0, 75), value: m[1] };
    });
  }

  // デフォルト: 汎用ボタン
  return [
    { text: "承認", value: "yes" },
    { text: "スキップ", value: "no" },
    { text: "詳細を見る", value: "詳細を教えてください" },
  ];
}

const buttons = detectButtons(question);

const elements = buttons.map((btn, i) => ({
  type: "button",
  text: { type: "plain_text", text: btn.text, emoji: true },
  value: btn.value,
  action_id: `claude_choice_${i}`,
  ...(i === 0 ? { style: "primary" } : {}),
}));

// --- Slack 送信 ---
const truncated = question.length > 2800 ? question.slice(0, 2800) + "..." : question;

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
    text: `⏳ ${truncated}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⏳ *Claude が判断を求めています*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: truncated,
        },
      },
      {
        type: "actions",
        elements,
      },
    ],
  }),
});

const result = await res.json();
if (!result.ok) {
  console.error("Slack post failed:", result.error);
}
