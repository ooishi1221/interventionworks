/**
 * Firestore Watcher — beta_errors コレクション監視
 *
 * firebase-admin で beta_errors の新規ドキュメントを検知し、
 * コールバック経由で Slack に通知する。
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Service Account 初期化
const SA_PATH = join(
  __dirname,
  "..",
  "..",
  "moto-logos",
  "scripts",
  "moto-spotter-firebase-adminsdk-fbsvc-10caec0046.json"
);

let db;
try {
  const sa = JSON.parse(readFileSync(SA_PATH, "utf-8"));
  initializeApp({ credential: cert(sa) });
  db = getFirestore();
  console.log("[Firestore Watcher] initialized");
} catch (e) {
  console.error("[Firestore Watcher] init failed:", e.message);
}

/**
 * beta_errors コレクションの監視を開始する。
 * @param {(blocks: object[], fallbackText: string) => Promise<void>} postToSlack
 */
export function startWatching(postToSlack) {
  if (!db) {
    console.warn("[Firestore Watcher] db not initialized, skipping");
    return;
  }

  const startedAt = Timestamp.now();

  db.collection("beta_errors")
    .where("createdAt", ">", startedAt)
    .onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const d = change.doc.data();
          const ts = d.createdAt?.toDate?.();
          const timeStr = ts
            ? ts.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            : "unknown";

          const contextStr = d.context
            ? Object.entries(d.context)
                .map(([k, v]) => `${k}: \`${v}\``)
                .join(" | ")
            : "—";

          const fallbackText = `🚨 Beta Error: ${d.message}`;

          const blocks = [
            {
              type: "header",
              text: { type: "plain_text", text: "🚨 Beta Error", emoji: true },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Error:*\n\`${(d.message || "").slice(0, 300)}\``,
                },
                {
                  type: "mrkdwn",
                  text: `*Context:*\n${contextStr}`,
                },
              ],
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*User:*\n\`${d.userId || "unknown"}\``,
                },
                {
                  type: "mrkdwn",
                  text: `*Device:*\n${d.deviceModel || "?"} · ${d.os || "?"} ${d.osVersion || ""}`,
                },
              ],
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `App v${d.appVersion || "?"} · ${timeStr}`,
                },
              ],
            },
          ];

          // スタックトレースがあれば折りたたみで追加
          if (d.stack) {
            blocks.push({
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Stack:*\n\`\`\`${d.stack.slice(0, 500)}\`\`\``,
              },
            });
          }

          blocks.push({ type: "divider" });

          postToSlack(blocks, fallbackText).catch((err) =>
            console.error("[Firestore Watcher] Slack post failed:", err.message)
          );
        }
      },
      (err) => {
        console.error("[Firestore Watcher] onSnapshot error:", err.message);
      }
    );

  console.log("[Firestore Watcher] watching beta_errors collection");
}
