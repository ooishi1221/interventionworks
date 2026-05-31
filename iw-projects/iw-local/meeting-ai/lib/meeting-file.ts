import { mkdir, appendFile, writeFile, copyFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MEETING_DIR = "/Users/yuji.ooishi/.meeting";
const CURRENT_FILE = path.join(MEETING_DIR, "current.txt");
const ARCHIVE_DIR = path.join(MEETING_DIR, "archive");
const SESSIONS_DIR = path.join(MEETING_DIR, "sessions");

/** JST の HH:MM:SS を返す */
function jstTimestamp(): string {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

/** JST の YYYY-MM-DD_HH-MM-SS を返す（アーカイブ用） */
function jstDatetimeForFilename(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }) // "2026-05-31 14:23:00"
    .replace(" ", "_")
    .replace(/:/g, "-");
}

/** ~/.meeting/ と archive/ と sessions/ を確保 */
async function ensureDirs(): Promise<void> {
  await mkdir(MEETING_DIR, { recursive: true });
  await mkdir(ARCHIVE_DIR, { recursive: true });
  await mkdir(SESSIONS_DIR, { recursive: true });
}

/** 文字起こしテキストを追記 */
export async function appendTranscript(text: string): Promise<void> {
  try {
    await ensureDirs();
    const line = `[${jstTimestamp()}] ${text}\n`;
    await appendFile(CURRENT_FILE, line, "utf-8");
  } catch (err) {
    // 書き込み失敗は録音フローを止めない
    console.error("[meeting-file] appendTranscript error:", err);
  }
}

/** セッション開始: current.txt をクリアして開始行を書く */
export async function startSession(): Promise<void> {
  await ensureDirs();
  const header = `=== セッション開始 [${jstTimestamp()}] ===\n`;
  await writeFile(CURRENT_FILE, header, "utf-8");
}

/** ブックマークを追記 */
export async function appendBookmark(text: string): Promise<void> {
  try {
    await ensureDirs();
    const line = `[${jstTimestamp()}] ★ ${text}\n`;
    await appendFile(CURRENT_FILE, line, "utf-8");
  } catch (err) {
    console.error("[meeting-file] appendBookmark error:", err);
  }
}

/** セッションを sessions/ に保存 */
export async function saveSession(summary: string): Promise<string> {
  try {
    await ensureDirs();
    const dt = new Date()
      .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
      .replace(" ", "_").slice(0, 16).replace(":", "-");
    const filename = `${dt}.txt`;
    let content = "";
    if (existsSync(CURRENT_FILE)) {
      content = await readFile(CURRENT_FILE, "utf-8");
    }
    const body = [content, "", "=== 要約 ===", summary || "(要約なし)"].join("\n");
    const filepath = path.join(SESSIONS_DIR, filename);
    await writeFile(filepath, body, "utf-8");
    return filepath;
  } catch (err) {
    console.error("[meeting-file] saveSession error:", err);
    return "";
  }
}

/** セッション終了: 終了行を追記してアーカイブに保存 */
export async function endSession(): Promise<void> {
  try {
    await ensureDirs();
    const footer = `=== セッション終了 [${jstTimestamp()}] ===\n`;
    await appendFile(CURRENT_FILE, footer, "utf-8");

    if (existsSync(CURRENT_FILE)) {
      const archiveName = `session_${jstDatetimeForFilename()}.txt`;
      await copyFile(CURRENT_FILE, path.join(ARCHIVE_DIR, archiveName));
    }
  } catch (err) {
    console.error("[meeting-file] endSession error:", err);
  }
}
