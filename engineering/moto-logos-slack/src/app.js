import bolt from "@slack/bolt";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn, execFile } from "child_process";
import { openSync } from "fs";

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

// Tool アイコン
const TOOL_ICONS = {
  Read: "📖", Edit: "✏️", Write: "📝", Bash: "🔨",
  Grep: "🔍", Glob: "📂", Agent: "🤖", WebSearch: "🌐",
  WebFetch: "🌐", AskUserQuestion: "❓",
};

function startSession(initialPrompt, threadTs) {
  if (session) {
    session.proc.kill();
    clearTimeout(session.heartbeatTimer);
    session = null;
  }

  const devNull = openSync("/dev/null", "r");
  const proc = spawn("claude", [
    "-p", "--verbose", "--output-format", "stream-json",
    initialPrompt,
  ], {
    cwd: PROJECT_ROOT,
    stdio: [devNull, "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });

  session = { proc, threadTs, lineBuf: "", heartbeatTimer: null };

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

  function handleJsonLine(line) {
    if (!session || !line.trim()) return;
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    resetHeartbeat();

    // ツール使用開始
    if (ev.type === "assistant" && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === "tool_use") {
          const icon = TOOL_ICONS[block.name] || "🔧";
          let detail = "";
          if (block.name === "Read" && block.input?.file_path) {
            detail = block.input.file_path.replace(PROJECT_ROOT + "/", "");
          } else if (block.name === "Edit" && block.input?.file_path) {
            detail = block.input.file_path.replace(PROJECT_ROOT + "/", "");
          } else if (block.name === "Write" && block.input?.file_path) {
            detail = block.input.file_path.replace(PROJECT_ROOT + "/", "");
          } else if (block.name === "Bash" && block.input?.command) {
            detail = truncate(block.input.command, 80);
          } else if (block.name === "Grep" && block.input?.pattern) {
            detail = `"${block.input.pattern}"`;
          } else if (block.name === "Glob" && block.input?.pattern) {
            detail = block.input.pattern;
          }
          postToSlack(`${icon} *${block.name}* ${detail}`, session.threadTs);
        }
        if (block.type === "text" && block.text?.trim()) {
          postToSlack(truncate(block.text.trim(), 2000), session.threadTs);
        }
      }
    }

    // 最終結果
    if (ev.type === "result") {
      const text = ev.result || "";
      if (text.trim()) {
        postToSlack(truncate(text.trim(), 3000), session.threadTs);
      }
      const cost = ev.total_cost_usd ? `$${ev.total_cost_usd.toFixed(4)}` : "";
      const dur = ev.duration_ms ? `${(ev.duration_ms / 1000).toFixed(1)}s` : "";
      postToSlack(`✅ 完了 ${dur} ${cost}`, session.threadTs);
    }
  }

  proc.stdout.on("data", (chunk) => {
    if (!session) return;
    session.lineBuf += chunk.toString();
    const lines = session.lineBuf.split("\n");
    session.lineBuf = lines.pop() || "";
    for (const line of lines) handleJsonLine(line);
  });

  proc.stderr.on("data", (chunk) => {
    console.log(`[claude:stderr] ${chunk.toString().trimEnd()}`);
  });

  proc.on("close", (code) => {
    if (!session) return;
    clearTimeout(session.heartbeatTimer);
    if (session.lineBuf.trim()) handleJsonLine(session.lineBuf);
    if (code !== 0) postToSlack(`⚠️ セッション終了 (exit ${code})`, threadTs);
    console.log(`[claude] exited with code ${code}`);
    session = null;
  });

  console.log(`[session] started (stream-json): "${initialPrompt}"`);
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
