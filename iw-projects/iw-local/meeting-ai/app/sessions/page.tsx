import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import Link from "next/link";

const SESSIONS_DIR = "/Users/yuji.ooishi/.meeting/sessions";

async function getSessions() {
  if (!existsSync(SESSIONS_DIR)) return [];
  const files = await readdir(SESSIONS_DIR);
  return files
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .reverse();
}

export default async function SessionsPage() {
  const sessions = await getSessions();

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="px-5 py-4 border-b border-zinc-800/60 flex items-center gap-3">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
          ← 戻る
        </Link>
        <span className="text-sm font-semibold">保存済みセッション</span>
        <span className="text-xs text-zinc-600">{sessions.length} 件</span>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center mt-12">
            保存されたセッションがありません
          </p>
        ) : (
          sessions.map((filename) => (
            <Link
              key={filename}
              href={`/sessions/${encodeURIComponent(filename)}`}
              className="block px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/60 transition-colors"
            >
              <p className="text-sm text-zinc-200">{filename.replace(".txt", "")}</p>
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
