"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  text: string;
  type: "transcript" | "summary" | "bookmark";
}

interface TimelineProps {
  entries: TimelineEntry[];
  summary: string;
  isRecording: boolean;
  retrying: boolean;
}

export default function Timeline({
  entries,
  summary,
  isRecording,
  retrying,
}: TimelineProps) {
  const transcriptEntries = entries.filter((e) => e.type === "transcript");
  const recent = transcriptEntries.slice(-3);
  const recentScrollRef = useRef<HTMLDivElement>(null);

  // 最新エントリが増えたらスクロール
  useEffect(() => {
    if (recentScrollRef.current) {
      recentScrollRef.current.scrollTop = recentScrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="flex flex-col h-full">

      {/* ── 最新発話エリア（PCのみ）── */}
      <div className="hidden md:block shrink-0 border-b border-zinc-800/60">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-medium">最新</span>
          {isRecording && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] text-red-400 font-medium">REC</span>
            </div>
          )}
          {retrying && !isRecording && (
            <span className="text-[11px] text-yellow-500 animate-pulse">再試行中...</span>
          )}
        </div>
        <div
          ref={recentScrollRef}
          className="px-4 pb-3 max-h-[7rem] overflow-y-auto space-y-1.5 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {recent.length === 0 ? (
            <p className="text-sm text-zinc-700 pb-1">
              {isRecording ? "音声を処理中..." : "録音を開始してください"}
            </p>
          ) : (
            recent.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex gap-2.5 text-sm transition-opacity ${
                  i === recent.length - 1 ? "opacity-100" : "opacity-40"
                }`}
              >
                <span className="text-zinc-700 font-mono tabular-nums text-[11px] pt-[3px] shrink-0 leading-5">
                  {entry.timestamp}
                </span>
                <span className="text-zinc-100 leading-relaxed">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── 要約エリア ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 pt-3 pb-1 shrink-0">
          <span className="text-xs text-zinc-500 font-medium">要約</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-4 pb-4">
            {summary ? (
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {summary}
              </p>
            ) : (
              <p className="text-sm text-zinc-700">
                録音開始から1分後に自動生成されます
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

    </div>
  );
}
