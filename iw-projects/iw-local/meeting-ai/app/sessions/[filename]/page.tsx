import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";

const SESSIONS_DIR = "/Users/yuji.ooishi/.meeting/sessions";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ filename: string }>;
}) {
  const { filename } = await params;
  const decoded = decodeURIComponent(filename);
  const filepath = path.join(SESSIONS_DIR, decoded);

  let content = "";
  try {
    content = await readFile(filepath, "utf-8");
  } catch {
    content = "ファイルが見つかりません";
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="px-5 py-4 border-b border-zinc-800/60 flex items-center gap-3 shrink-0">
        <Link href="/sessions" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
          ← 一覧
        </Link>
        <span className="text-sm font-semibold truncate">{decoded.replace(".txt", "")}</span>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-4">
        <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
          {content}
        </pre>
      </main>
    </div>
  );
}
