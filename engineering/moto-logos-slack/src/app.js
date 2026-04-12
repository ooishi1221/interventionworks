import bolt from "@slack/bolt";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { execFile } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const { App } = bolt;

// --- Validate required tokens ---
const requiredEnvs = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"];
for (const key of requiredEnvs) {
  if (!process.env[key]) {
    console.error(`[ERROR] ${key} が未設定です。.env を確認してください。`);
    console.error("セットアップ手順: README.md を参照");
    process.exit(1);
  }
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const BOT_IDENTITY = { username: "Claude Code", icon_emoji: ":zap:" };

const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const RESPONSE_DIR = join(__dirname, "..", ".responses");
mkdirSync(RESPONSE_DIR, { recursive: true });

// --- Helper: run Claude CLI ---
function runClaude(args, cwd = PROJECT_ROOT) {
  return new Promise((resolve, reject) => {
    execFile("claude", args, {
      cwd,
      encoding: "utf-8",
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

// --- Truncate long text for Slack (max 3000 chars) ---
function truncate(text, max = 3000) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...(truncated)";
}

// --- Button action handler ---
// When user clicks a choice button in Slack, capture the response
app.action(/^claude_choice_/, async ({ action, body, ack, say }) => {
  await ack();

  const selectedValue = action.value;
  const user = body.user.name;
  const timestamp = new Date().toISOString();

  const response = {
    selected: selectedValue,
    user,
    timestamp,
    messageTs: body.message.ts,
  };

  // Save response to file for other processes to read
  const responseFile = join(RESPONSE_DIR, "latest-response.json");
  writeFileSync(responseFile, JSON.stringify(response, null, 2));

  console.log(`[Slack] ${user} selected: ${selectedValue}`);

  await say({
    text: `*${selectedValue}* を選択しました。Claude に伝えます。`,
    thread_ts: body.message.ts,
    ...BOT_IDENTITY,
  });

  // Resume Claude Code with the selected response
  try {
    await runClaude([
      "--continue",
      "-p",
      `ユーザーがSlackで「${selectedValue}」を選択しました。この選択に基づいて作業を続けてください。`,
    ]);
  } catch (err) {
    console.error("[Claude] Resume failed:", err.message);
  }
});

// --- Slash command: /claude ---
// Users can send messages to Claude directly from Slack
app.command("/claude", async ({ command, ack, say }) => {
  await ack();

  const userMessage = command.text;
  const user = command.user_name;

  console.log(`[Slack] /claude from ${user}: ${userMessage}`);

  await say({ text: `*${user}* のリクエストを処理中...\n> ${userMessage}`, ...BOT_IDENTITY });

  try {
    const result = await runClaude(["-p", userMessage]);

    await say({
      text: `*Claude の回答:*\n${truncate(result)}`,
      ...BOT_IDENTITY,
    });
  } catch (err) {
    await say({ text: `エラーが発生しました: ${err.message.slice(0, 500)}`, ...BOT_IDENTITY });
  }
});

// --- App mention handler ---
// When someone @mentions the bot in a channel
app.event("app_mention", async ({ event, say }) => {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const user = event.user;

  if (!userMessage) {
    await say({
      text: "メッセージを入力してください。例: `@MotoLogos グローブの仕様を教えて`",
      thread_ts: event.ts,
      ...BOT_IDENTITY,
    });
    return;
  }

  console.log(`[Slack] Mention from ${user}: ${userMessage}`);

  await say({
    text: `処理中...`,
    thread_ts: event.ts,
    ...BOT_IDENTITY,
  });

  try {
    const result = await runClaude(["-p", userMessage]);

    await say({
      text: truncate(result),
      thread_ts: event.ts,
      ...BOT_IDENTITY,
    });
  } catch (err) {
    await say({
      text: `エラー: ${err.message.slice(0, 500)}`,
      thread_ts: event.ts,
      ...BOT_IDENTITY,
    });
  }
});

// --- DM handler ---
// Direct messages to the bot
app.event("message", async ({ event, say }) => {
  // Only handle DMs (channel type "im"), skip bot messages, skip threaded replies
  if (event.channel_type !== "im" || event.bot_id || event.subtype || event.thread_ts) {
    return;
  }

  const userMessage = event.text;
  console.log(`[Slack] DM from ${event.user}: ${userMessage}`);

  try {
    const result = await runClaude(["-p", userMessage]);

    await say({
      text: truncate(result),
      thread_ts: event.ts,
      ...BOT_IDENTITY,
    });
  } catch (err) {
    await say({
      text: `エラー: ${err.message.slice(0, 500)}`,
      thread_ts: event.ts,
      ...BOT_IDENTITY,
    });
  }
});

// --- Graceful shutdown ---
function shutdown(signal) {
  console.log(`\n[Slack Bot] ${signal} received, shutting down...`);
  app.stop().then(() => {
    console.log("[Slack Bot] Disconnected.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// --- Start ---
(async () => {
  try {
    await app.start();
    console.log("⚡ Moto-Logos Slack Bot is running (Socket Mode)");
    console.log(`   Project root: ${PROJECT_ROOT}`);
    console.log("   Listening for: /claude, @mentions, DMs, button clicks");
  } catch (err) {
    console.error("[FATAL] Bot startup failed:", err.message);
    console.error("SLACK_BOT_TOKEN と SLACK_APP_TOKEN を確認してください。");
    process.exit(1);
  }
})();
