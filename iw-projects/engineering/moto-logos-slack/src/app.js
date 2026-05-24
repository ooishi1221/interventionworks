import bolt from "@slack/bolt";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn, execFile } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { startWatching } from "./firestore-watcher.js";

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
const CHANNEL_DEV_LOG = "C0ASQ80PGJV";

// --- Utilities ---

function truncate(text, max = 3000) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n...(truncated)";
}

// --- Terminal input injection (macOS) ---
function typeIntoTerminal(text) {
  const pb = spawn("pbcopy");
  pb.stdin.write(text);
  pb.stdin.end();

  pb.on("close", () => {
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

// Tool アイコン
const TOOL_ICONS = {
  Read: "📖", Edit: "✏️", Write: "📝", Bash: "🔨",
  Grep: "🔍", Glob: "📂", Agent: "🤖", WebSearch: "🌐",
  WebFetch: "🌐", AskUserQuestion: "❓",
};

const HEARTBEAT_DELAY = 30_000;

// --- Image download ---
const IMAGES_DIR = join(PROJECT_ROOT, ".slack_images");

async function downloadSlackFiles(files) {
  if (!files || files.length === 0) return [];
  await mkdir(IMAGES_DIR, { recursive: true });

  const paths = [];
  for (const file of files) {
    if (!file.mimetype?.startsWith("image/")) continue;
    const localName = `${Date.now()}_${file.name || "image.png"}`;
    const localPath = join(IMAGES_DIR, localName);
    try {
      const res = await fetch(file.url_private_download, {
        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(localPath, Buffer.from(await res.arrayBuffer()));
      paths.push(localPath);
      console.log(`[download] ${file.name} → ${localPath}`);
    } catch (e) {
      console.error(`[download] failed: ${file.name}: ${e.message}`);
    }
  }
  return paths;
}

function buildPromptWithImages(text, imagePaths) {
  if (imagePaths.length === 0) return text;
  const listing = imagePaths.join("\n");
  if (!text) return `以下の画像を確認してください:\n${listing}`;
  return `${text}\n\n以下の画像を確認してください:\n${listing}`;
}

// --- Session state ---
// セッションは会話コンテキストを追跡（常駐プロセスではない）
// メッセージごとに claude -p --resume SESSION_ID で新プロセスを起動
let session = null; // { sessionId, threadTs, channelId, busy, heartbeatTimer }
let currentProc = null;

function postToSlack(text, threadTs, channel = CHANNEL) {
  return app.client.chat.postMessage({
    channel,
    text,
    thread_ts: threadTs,
    ...BOT,
  });
}

async function runClaude(prompt, threadTs, channelId, resumeSessionId = null) {
  if (session?.busy) {
    postToSlack("⏳ 処理中です...", threadTs, channelId);
    return;
  }

  session = {
    sessionId: resumeSessionId,
    threadTs,
    channelId,
    busy: true,
    heartbeatTimer: null,
  };

  const args = ["-p", "--verbose", "--output-format", "stream-json"];
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  args.push(prompt);

  const proc = spawn("claude", args, {
    cwd: PROJECT_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });
  proc.stdin.end();
  currentProc = proc;

  let lineBuf = "";
  let extractedSessionId = resumeSessionId;

  function resetHeartbeat() {
    if (!session) return;
    clearTimeout(session.heartbeatTimer);
    session.heartbeatTimer = setTimeout(() => {
      if (session?.busy) {
        postToSlack("... 作業中 ...", threadTs, channelId);
        resetHeartbeat();
      }
    }, HEARTBEAT_DELAY);
  }

  function handleJsonLine(line) {
    if (!line.trim()) return;
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    resetHeartbeat();

    // session_id を抽出
    if (ev.session_id && !extractedSessionId) {
      extractedSessionId = ev.session_id;
    }

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
          postToSlack(`${icon} *${block.name}* ${detail}`, threadTs, channelId);
        }
        if (block.type === "text" && block.text?.trim()) {
          postToSlack(truncate(block.text.trim(), 2000), threadTs, channelId);
        }
      }
    }

    // 最終結果
    if (ev.type === "result") {
      const text = ev.result || "";
      if (text.trim()) {
        postToSlack(truncate(text.trim(), 3000), threadTs, channelId);
      }
      const cost = ev.total_cost_usd ? `$${ev.total_cost_usd.toFixed(4)}` : "";
      const dur = ev.duration_ms ? `${(ev.duration_ms / 1000).toFixed(1)}s` : "";
      postToSlack(`✅ 完了 ${dur} ${cost}`, threadTs, channelId);
    }
  }

  proc.stdout.on("data", (chunk) => {
    lineBuf += chunk.toString();
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() || "";
    for (const l of lines) handleJsonLine(l);
  });

  proc.stderr.on("data", (chunk) => {
    console.log(`[claude:stderr] ${chunk.toString().trimEnd()}`);
  });

  return new Promise((resolve) => {
    proc.on("close", (code) => {
      clearTimeout(session?.heartbeatTimer);
      if (lineBuf.trim()) handleJsonLine(lineBuf);
      if (code !== 0) postToSlack(`⚠️ エラー (exit ${code})`, threadTs, channelId);
      console.log(`[claude] exited (code ${code}), sessionId: ${extractedSessionId}`);
      currentProc = null;

      session = {
        sessionId: extractedSessionId,
        threadTs,
        channelId,
        busy: false,
        heartbeatTimer: null,
      };
      resolve(extractedSessionId);
    });
  });
}

// --- /claude command ---
app.command("/claude", async ({ command, ack, say }) => {
  await ack();
  const msg = command.text;
  console.log(`[Slack] /claude from ${command.user_name}: ${msg}`);
  const posted = await say({ text: `> ${msg}\nセッション開始...`, ...BOT });
  runClaude(msg, posted.ts, CHANNEL);
});

// --- @mention ---
app.event("app_mention", async ({ event, say }) => {
  const msg = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const imagePaths = await downloadSlackFiles(event.files);

  if (!msg && imagePaths.length === 0) return;

  // Image only → save and acknowledge (no session)
  if (!msg && imagePaths.length > 0) {
    await say({
      text: `📸 画像を保存しました:\n${imagePaths.join("\n")}`,
      thread_ts: event.ts,
      ...BOT,
    });
    return;
  }

  const prompt = buildPromptWithImages(msg, imagePaths);
  console.log(`[Slack] mention: ${prompt}`);
  const posted = await say({
    text: `> ${msg}\nセッション開始...`,
    thread_ts: event.ts,
    ...BOT,
  });
  runClaude(prompt, posted.ts || event.ts, event.channel);
});

// --- Button click handler ---
app.action(/^claude_choice_/, async ({ action, ack, body, client }) => {
  await ack();
  const chosen = action.value;
  const userId = body.user?.id;
  console.log(`[Slack] button clicked: "${chosen}" by ${userId}`);

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

  if (session?.sessionId) {
    console.log(`[button→resume] ${chosen}`);
    postToSlack(`📨 "${chosen}" を送信しました`, session.threadTs, session.channelId);
    runClaude(chosen, session.threadTs, session.channelId, session.sessionId);
  } else {
    console.log(`[button→terminal] ${chosen}`);
    typeIntoTerminal(chosen);
    await client.chat.postMessage({
      channel: body.channel?.id || CHANNEL,
      text: `📨 "${chosen}" をターミナルに送信しました`,
      ...BOT,
    });
  }
});

// --- Thread reply → --resume ---
app.event("message", async ({ event }) => {
  if (!session?.sessionId) return;
  if (!event.thread_ts) return;
  if (event.thread_ts !== session.threadTs) return;
  if (event.bot_id) return;
  if (event.subtype && event.subtype !== "file_share") return;

  const imagePaths = await downloadSlackFiles(event.files);
  const text = event.text || "";

  if (imagePaths.length > 0) {
    postToSlack(`📸 画像を保存しました:\n${imagePaths.join("\n")}`, session.threadTs, session.channelId);
  }

  const reply = buildPromptWithImages(text, imagePaths);
  if (!reply) return;

  console.log(`[Slack→resume] ${reply}`);
  runClaude(reply, session.threadTs, session.channelId, session.sessionId);
});

// --- DM ---
app.event("message", async ({ event, say }) => {
  if (event.channel_type !== "im" || event.bot_id || event.thread_ts) return;
  if (event.subtype && event.subtype !== "file_share") return;

  const imagePaths = await downloadSlackFiles(event.files);
  const text = event.text || "";

  if (!text && imagePaths.length === 0) return;

  // Image only → save and acknowledge (no session)
  if (!text && imagePaths.length > 0) {
    await say({
      text: `📸 画像を保存しました:\n${imagePaths.join("\n")}`,
      thread_ts: event.ts,
      ...BOT,
    });
    return;
  }

  const msg = buildPromptWithImages(text, imagePaths);
  console.log(`[Slack] DM: ${msg}`);

  // 既存セッションがDMチャンネルなら --resume で会話を続ける
  if (session?.sessionId && session.channelId === event.channel) {
    runClaude(msg, session.threadTs, event.channel, session.sessionId);
    return;
  }

  const posted = await say({
    text: `> ${text}\nセッション開始...`,
    thread_ts: event.ts,
    ...BOT,
  });
  runClaude(msg, posted.ts || event.ts, event.channel);
});

// --- Channel image (no mention needed) ---
app.event("message", async ({ event }) => {
  if (event.channel_type === "im") return;
  if (event.thread_ts) return;
  if (event.bot_id) return;
  if (event.channel !== CHANNEL && event.channel !== CHANNEL_DEV_LOG) return;
  if (!event.files || event.files.length === 0) return;
  if (event.subtype && event.subtype !== "file_share") return;
  // Skip mentions (handled by app_mention handler)
  if (event.text && /<@[A-Z0-9]+>/.test(event.text)) return;

  const imagePaths = await downloadSlackFiles(event.files);
  if (imagePaths.length === 0) return;

  postToSlack(`📸 画像を保存しました:\n${imagePaths.join("\n")}`, event.ts, event.channel);
});

// --- Graceful shutdown ---
process.on("SIGINT", () => {
  if (currentProc) currentProc.kill();
  app.stop().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  if (currentProc) currentProc.kill();
  app.stop().then(() => process.exit(0));
});

// --- Start ---
(async () => {
  await app.start();
  console.log("Slack <-> Claude Code bridge running (resume mode)");
  console.log(`   Channel: ${CHANNEL}`);
  console.log(`   Project: ${PROJECT_ROOT}`);

  // β自動エラー通知: Firestore beta_errors → Slack
  startWatching(async (blocks, text) => {
    await app.client.chat.postMessage({
      channel: CHANNEL,
      text,
      blocks,
      ...BOT,
    });
  });
})();
