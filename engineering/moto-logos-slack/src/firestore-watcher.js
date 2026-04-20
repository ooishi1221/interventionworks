/**
 * Firestore Watcher — beta_errors + beta_feedback コレクション監視
 *
 * firebase-admin で新規ドキュメントを検知し、
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

const TYPE_LABELS = { bug: "バグ", opinion: "意見", confused: "わからない" };
const REPORT_REASON_LABELS = { inappropriate: "公序良俗違反", spam: "スパム", misleading: "誤情報", other: "その他" };

/**
 * beta_errors + beta_feedback コレクションの監視を開始する。
 * @param {(blocks: object[], fallbackText: string) => Promise<void>} postToSlack
 */
export function startWatching(postToSlack) {
  if (!db) {
    console.warn("[Firestore Watcher] db not initialized, skipping");
    return;
  }

  const startedAt = Timestamp.now();

  // ── beta_errors 監視 ──────────────────────────────
  db.collection("beta_errors")
    .where("createdAt", ">", startedAt)
    .onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const d = change.doc.data();
          const timeStr = formatTime(d.createdAt);

          const contextStr = d.context
            ? Object.entries(d.context)
                .map(([k, v]) => `${k}: \`${v}\``)
                .join(" | ")
            : "—";

          const blocks = [
            { type: "header", text: { type: "plain_text", text: "🚨 Beta Error", emoji: true } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*Error:*\n\`${(d.message || "").slice(0, 300)}\`` },
              { type: "mrkdwn", text: `*Context:*\n${contextStr}` },
            ]},
            { type: "section", fields: [
              { type: "mrkdwn", text: `*User:*\n\`${d.userId || "unknown"}\`` },
              { type: "mrkdwn", text: `*Device:*\n${d.deviceModel || "?"} · ${d.os || "?"} ${d.osVersion || ""}` },
            ]},
            { type: "context", elements: [
              { type: "mrkdwn", text: `App v${d.appVersion || "?"} · ${timeStr}` },
            ]},
          ];

          if (d.stack) {
            blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Stack:*\n\`\`\`${d.stack.slice(0, 500)}\`\`\`` }});
          }
          blocks.push({ type: "divider" });

          postToSlack(blocks, `🚨 Beta Error: ${d.message}`).catch((err) =>
            console.error("[Watcher] error post failed:", err.message)
          );
        }
      },
      (err) => console.error("[Watcher] beta_errors onSnapshot error:", err.message)
    );

  // ── beta_feedback 監視 ─────────────────────────────
  db.collection("beta_feedback")
    .where("createdAt", ">", startedAt)
    .onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const d = change.doc.data();
          const timeStr = formatTime(d.createdAt);
          const typeLabel = TYPE_LABELS[d.feedbackType] || d.feedbackType || "?";

          const blocks = [
            { type: "header", text: { type: "plain_text", text: `💬 Beta Feedback [${typeLabel}]`, emoji: true } },
            { type: "section", text: { type: "mrkdwn",
              text: `> ${(d.message || "").slice(0, 500)}`,
            }},
            { type: "section", fields: [
              { type: "mrkdwn", text: `*User:*\n\`${d.userId || "unknown"}\`` },
              { type: "mrkdwn", text: `*Device:*\n${d.deviceModel || "?"} · ${d.os || "?"} ${d.osVersion || ""}` },
            ]},
            { type: "context", elements: [
              { type: "mrkdwn", text: `App v${d.appVersion || "?"} · ${timeStr}` },
            ]},
          ];

          if (d.photoUrl) {
            blocks.push({ type: "image", image_url: d.photoUrl, alt_text: "feedback photo" });
          }
          blocks.push({ type: "divider" });

          postToSlack(blocks, `💬 Feedback [${typeLabel}]: ${d.message}`).catch((err) =>
            console.error("[Watcher] feedback post failed:", err.message)
          );
        }
      },
      (err) => console.error("[Watcher] beta_feedback onSnapshot error:", err.message)
    );

  // ── debug_reports 監視 ─────────────────────────────
  // 設定画面の「デバッグ情報を送信」ボタンで書き込まれる
  db.collection("debug_reports")
    .where("createdAt", ">", startedAt)
    .onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const d = change.doc.data();
          const timeStr = formatTime(d.createdAt);
          const recent = (d.recentErrors || []).slice(0, 3);
          const errorSummary = recent.length
            ? recent
                .map(
                  (e) =>
                    `• \`${(e.context || "").slice(0, 30)}\` ${(e.message || "").slice(0, 80)}`,
                )
                .join("\n")
            : "_(直近エラーなし)_";

          const blocks = [
            { type: "header", text: { type: "plain_text", text: "🐛 Debug Report", emoji: true } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*User:*\n\`${d.userId || "unknown"}\`` },
              { type: "mrkdwn", text: `*Device:*\n${d.deviceBrand || ""} ${d.deviceModel || "?"}\n${d.platform || "?"} ${d.osVersion || ""}` },
              { type: "mrkdwn", text: `*App:*\nv${d.appVersion || "?"} (build ${d.buildNumber ?? "?"})` },
              { type: "mrkdwn", text: `*Update/Channel:*\n\`${(d.updateId || "?").slice(0, 8)}\` / ${d.channel || "?"}` },
            ]},
            { type: "section", text: { type: "mrkdwn",
              text: `*直近エラー (最新${recent.length}件):*\n${errorSummary}`,
            }},
            { type: "context", elements: [
              { type: "mrkdwn", text: `docId: \`${change.doc.id}\` · ${timeStr}` },
            ]},
            { type: "divider" },
          ];

          if (d.userNote) {
            blocks.splice(2, 0, {
              type: "section",
              text: { type: "mrkdwn", text: `> ${String(d.userNote).slice(0, 500)}` },
            });
          }

          postToSlack(blocks, `🐛 Debug Report from ${d.userId}`).catch((err) =>
            console.error("[Watcher] debug_report post failed:", err.message)
          );
        }
      },
      (err) => console.error("[Watcher] debug_reports onSnapshot error:", err.message)
    );

  // ── reports 監視 ───────────────────────────────────
  // ワンショット通報（Apple Guideline 1.2 準拠）
  db.collection("reports")
    .where("createdAt", ">", startedAt)
    .onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const d = change.doc.data();
          const timeStr = formatTime(d.createdAt);
          const reasonLabel = REPORT_REASON_LABELS[d.reason] || d.reason || "?";

          const blocks = [
            { type: "header", text: { type: "plain_text", text: `🚩 Report [${reasonLabel}]`, emoji: true } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*対象レビュー:*\n\`${d.reviewId || "?"}\`` },
              { type: "mrkdwn", text: `*対象スポット:*\n\`${d.spotId || "?"}\`` },
            ]},
            { type: "section", fields: [
              { type: "mrkdwn", text: `*通報された投稿者:*\n\`${d.targetUserId || "?"}\`` },
              { type: "mrkdwn", text: `*通報者:*\n\`${d.reporterUid || "?"}\`` },
            ]},
          ];

          if (d.description) {
            blocks.push({ type: "section", text: { type: "mrkdwn",
              text: `*補足:*\n> ${String(d.description).slice(0, 500)}`,
            }});
          }

          blocks.push({ type: "context", elements: [
            { type: "mrkdwn", text: `docId: \`${change.doc.id}\` · ${timeStr}` },
          ]});
          blocks.push({ type: "divider" });

          postToSlack(blocks, `🚩 Report [${reasonLabel}]: review=${d.reviewId}`).catch((err) =>
            console.error("[Watcher] report post failed:", err.message)
          );
        }
      },
      (err) => console.error("[Watcher] reports onSnapshot error:", err.message)
    );

  console.log("[Firestore Watcher] watching beta_errors + beta_feedback + debug_reports + reports");
}

function formatTime(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "unknown";
}
