import bolt from "@slack/bolt";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn, execFile } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const { App } = bolt;

const requiredEnvs = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"];
for (const key of requiredEnvs) {
  if (!process.env[key]) {
    console.error(`[ERROR] ${key} が未設定です。`);
    process.exit(1);
  }
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const BOT = { username: "Claude Code", icon_emoji: ":zap:" };
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const CHANNEL = process.env.SLACK_CHANNEL_ID;

// --- Utilities ---

// Strip ANSI escape sequences for clean Slack output
function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1B\][\s\S]*?(?:\x07|\x1B\\)/g, "")
    .replace(/\x1B[P_^][\s\S]*?\x1B\\/g, "")
    .replace(/\x1B[NO]./g, "")
    .replace(/\x1B[()#][A-Z0-9]/g, "")
    .replace(/\x1B[=><=<~{}|]/g, "")
    .replace(/\x9B[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1B./g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function truncate(text, max = 3000) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...(truncated)";
}

function isQuestion(text) {
  const line = text.trim();
  if (!line || line.length < 3) return false;
  return (
    /\?\s*$/.test(line) ||
    /\(y\/n\)/i.test(line) ||
    /\[y\/n\]/i.test(line) ||
    /\[yes\/no\]/i.test(line) ||
    /Allow .+\?/i.test(line) ||
    /Do you want/i.test(line) ||
    /確認してください|選択してください/.test(line)
  );
}

// --- Terminal input injection (macOS) ---
// Slackボタン押下 → クリップボードにコピー → VS Code をアクティブ化 → ペースト+Enter
function typeIntoTerminal(text) {
  // 1. クリップボードにコピー
  const pb = spawn("pbcopy");
  pb.stdin.write(text);
  pb.stdin.end();

  pb.on("close", () => {
    // 2. VS Code をアクティブにして Cmd+V → Enter
    execFile("osascript",
      [
        "-e", 'tell application "Code" to activate',
        "-e", "delay 0.5",
        "-e", 'tell application "System Events" to keystroke "v" using command down',
        "-e", "delay 0.2",
        "-e", 'tell application "System Events" to key code 36',
      ],
      (err) => {
        if (err) console.error("[typeIntoTerminal] osascript failed:", err.message);
        else console.log(`[typeIntoTerminal] pasted: "${text}"`);
      }
    );
  });
}

// --- Active interactive session ---
let session = null;

function postToSlack(text, threadTs) {
  return app.client.chat.postMessage({
    channel: CHANNEL,
    text,
    thread_ts: threadTs,
    ...BOT,
  });
}

const PROGRESS_DELAY = 5_000;
const HEARTBEAT_DELAY = 30_000;

function startSession(initialPrompt, threadTs) {
  if (session) {
    session.proc.kill();
    clearTimeout(session.progressTimer);
    clearTimeout(session.heartbeatTimer);
    session = null;
  }

  const proc = spawn("claude", [], {
    cwd: PROJECT_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });

  session = {
    proc,
    threadTs,
    lineBuf: "",
    progressBuf: "",
    progressTimer: null,
    heartbeatTimer: null,
  };

  function resetHeartbeat() {
    if (!session) return;
    clearTimeout(session.heartbeatTimer);
    session.heartbeatTimer = setTimeout(() => {
      if (session) {
        postToSlack("... 作業中 ...", session.threadTs);
        resetHeartbeat();
      }
    }, HEARTBEAT_DELAY);
  }

  function flushProgress() {
    if (!session) return;
    clearTimeout(session.progressTimer);
    const text = session.progressBuf.trim();
    if (text) {
      postToSlack(`\`\`\`\n${truncate(text)}\n\`\`\``, session.threadTs);
      session.progressBuf = "";
    }
  }

  function scheduleProgress() {
    if (!session) return;
    clearTimeout(session.progressTimer);
    session.progressTimer = setTimeout(flushProgress, PROGRESS_DELAY);
  }

  function handleOutput(chunk) {
    if (!session) return;
    const text = stripAnsi(chunk.toString());
    session.lineBuf += text;
    resetHeartbeat();

    const parts = session.lineBuf.split("\n");
    session.lineBuf = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;

      if (isQuestion(line)) {
        flushProgress();
        postToSlack(line, session.threadTs);
      } else {
        session.progressBuf += line + "\n";
        scheduleProgress();
      }
    }

    const pending = session.lineBuf.trim();
    if (pending && isQuestion(pending)) {
      flushProgress();
      postToSlack(pending, session.threadTs);
      session.lineBuf = "";
    }
  }

  proc.stdout.on("data", handleOutput);
  proc.stderr.on("data", (chunk) => {
    console.log(`[claude:stderr] ${chunk.toString().trimEnd()}`);
  });

  proc.on("close", (code) => {
    if (!session) return;
    clearTimeout(session.progressTimer);
    clearTimeout(session.heartbeatTimer);
    const remaining = (session.progressBuf + session.lineBuf).trim();
    if (remaining) {
      postToSlack(truncate(remaining), session.threadTs);
    }
    postToSlack(`セッション終了 (exit ${code})`, threadTs);
    console.log(`[claude] exited with code ${code}`);
    session = null;
  });

  proc.stdin.write(initialPrompt + "\n");
  console.log(`[session] started: "${initialPrompt}"`);
}

// --- /claude command ---
app.command("/claude", async ({ command, ack, say }) => {
  await ack();
  const msg = command.text;
  console.log(`[Slack] /claude from ${command.user_name}: ${msg}`);
  const posted = await say({ text: `> ${msg}\nセッション開始...`, ...BOT });
  startSession(msg, posted.ts);
});

// --- @mention ---
app.event("app_mention", async ({ event, say }) => {
  const msg = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!msg) return;
  console.log(`[Slack] mention: ${msg}`);
  const posted = await say({
    text: `> ${msg}\nセッション開始...`,
    thread_ts: event.ts,
    ...BOT,
  });
  startSession(msg, posted.ts || event.ts);
});

// --- Button click handler ---
app.action(/^claude_choice_/, async ({ action, ack, body, client }) => {
  await ack();
  const chosen = action.value;
  const userId = body.user?.id;
  console.log(`[Slack] button clicked: "${chosen}" by ${userId}`);

  // メッセージを更新して選択結果を表示
  try {
    await client.chat.update({
      channel: body.channel?.id || CHANNEL,
      ts: body.message?.ts,
      text: `✅ *${chosen}* を選択しました`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `✅ *${chosen}* を選択しました（by <@${userId}>）` },
        },
      ],
    });
  } catch (e) {
    console.error("[button] message update failed:", e.message);
  }

  // アクティブセッションがあれば選択結果を stdin に転送
  if (session) {
    console.log(`[button→stdin] ${chosen}`);
    session.proc.stdin.write(chosen + "\n");
    postToSlack(`📨 "${chosen}" をセッションに送信しました`, session.threadTs);
  } else {
    // セッションなし → ターミナルに直接入力を試みる
    console.log(`[button→terminal] ${chosen}`);
    typeIntoTerminal(chosen);
    await client.chat.postMessage({
      channel: body.channel?.id || CHANNEL,
      text: `📨 "${chosen}" をターミナルに送信しました`,
      ...BOT,
    });
  }
});

// --- Thread reply → stdin ---
app.event("message", async ({ event }) => {
  if (!session) return;
  if (!event.thread_ts) return;
  if (event.thread_ts !== session.threadTs) return;
  if (event.bot_id || event.subtype) return;

  const reply = event.text;
  console.log(`[Slack→stdin] ${reply}`);
  session.proc.stdin.write(reply + "\n");
});

// --- DM ---
app.event("message", async ({ event, say }) => {
  if (event.channel_type !== "im" || event.bot_id || event.subtype || event.thread_ts) return;

  const msg = event.text;
  console.log(`[Slack] DM: ${msg}`);

  if (session) {
    session.proc.stdin.write(msg + "\n");
    return;
  }

  const posted = await say({
    text: `> ${msg}\nセッション開始...`,
    thread_ts: event.ts,
    ...BOT,
  });
  startSession(msg, posted.ts || event.ts);
});

// --- Graceful shutdown ---
process.on("SIGINT", () => {
  if (session) session.proc.kill();
  app.stop().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  if (session) session.proc.kill();
  app.stop().then(() => process.exit(0));
});

// --- Start ---
(async () => {
  await app.start();
  console.log("Slack <-> Claude Code bridge running");
  console.log(`   Channel: ${CHANNEL}`);
  console.log(`   Project: ${PROJECT_ROOT}`);
})();
