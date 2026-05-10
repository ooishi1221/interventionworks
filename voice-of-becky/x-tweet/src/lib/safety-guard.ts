import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..", "..");

function resolveProjectPath(
  envValue: string | undefined,
  fallback: string
): string {
  if (!envValue) return join(projectRoot, fallback);
  if (envValue.startsWith("/")) return envValue;
  return join(projectRoot, envValue);
}

const namelistPath = resolveProjectPath(
  process.env.X_TWEET_NAMELIST_PATH,
  "safety-guard-namelist.txt"
);
const emergencyStopPath = join(projectRoot, "EMERGENCY_STOP");
const pauseUntilPath = join(projectRoot, "PAUSE_UNTIL");

const MAX_TWEET_LENGTH = 280;

export type GuardResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      blockedBy:
        | "emergency_stop"
        | "pause_until"
        | "namelist"
        | "personal_info"
        | "character_count";
    };

function loadNamelist(): string[] {
  if (!existsSync(namelistPath)) return [];
  const content = readFileSync(namelistPath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function checkKillSwitch(): GuardResult {
  if (existsSync(emergencyStopPath)) {
    return {
      ok: false,
      reason: `EMERGENCY_STOP ファイル検出。投稿停止中。復旧は \`rm ${emergencyStopPath}\``,
      blockedBy: "emergency_stop",
    };
  }
  if (existsSync(pauseUntilPath)) {
    const content = readFileSync(pauseUntilPath, "utf-8").trim();
    const match = content.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const pauseUntil = new Date(match[1]);
      const now = new Date();
      if (now < pauseUntil) {
        return {
          ok: false,
          reason: `PAUSE_UNTIL ${match[1]} まで投稿停止中`,
          blockedBy: "pause_until",
        };
      }
    }
  }
  return { ok: true };
}

function checkNamelist(text: string): GuardResult {
  const namelist = loadNamelist();
  const lowerText = text.toLowerCase();
  for (const name of namelist) {
    if (lowerText.includes(name.toLowerCase())) {
      return {
        ok: false,
        reason: `namelist の語句「${name}」を検出。投稿しない方がいい単語が含まれてる`,
        blockedBy: "namelist",
      };
    }
  }
  return { ok: true };
}

function checkPersonalInfo(text: string): GuardResult {
  if (/0\d{1,3}-?\d{1,4}-?\d{4}/.test(text)) {
    return {
      ok: false,
      reason: "電話番号らしきパターン検出",
      blockedBy: "personal_info",
    };
  }
  if (/[\w.-]+@[\w.-]+\.\w+/.test(text)) {
    return {
      ok: false,
      reason: "メールアドレス検出",
      blockedBy: "personal_info",
    };
  }
  if (/\d{4}-?\d{4}-?\d{4}-?\d{4}/.test(text)) {
    return {
      ok: false,
      reason: "クレカ番号らしきパターン検出",
      blockedBy: "personal_info",
    };
  }
  return { ok: true };
}

function checkCharacterCount(text: string): GuardResult {
  const length = Array.from(text).length;
  if (length > MAX_TWEET_LENGTH) {
    return {
      ok: false,
      reason: `文字数 ${length} が上限 ${MAX_TWEET_LENGTH} を超過`,
      blockedBy: "character_count",
    };
  }
  return { ok: true };
}

export function checkSafetyGuard(text: string): GuardResult {
  const checks = [
    checkKillSwitch(),
    checkPersonalInfo(text),
    checkNamelist(text),
    checkCharacterCount(text),
  ];
  for (const result of checks) {
    if (!result.ok) return result;
  }
  return { ok: true };
}

export function getKillSwitchStatus() {
  return {
    emergencyStop: existsSync(emergencyStopPath),
    pauseUntil: existsSync(pauseUntilPath)
      ? readFileSync(pauseUntilPath, "utf-8").trim()
      : null,
    namelistEntries: loadNamelist().length,
  };
}
