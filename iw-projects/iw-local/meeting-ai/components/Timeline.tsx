"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  text: string;
  type: "transcript" | "summary";
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex flex-col h-full">
      {/* 同期要約エリア */}
      <div className="border-b border-zinc-800 p-4 min-h-[120px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            同期要約
          </span>
          {isRecording && (
            <Badge variant="default" className="bg-red-600 text-white text-xs animate-pulse">
              ● REC
            </Badge>
          )}
          {retrying && (
            <Badge variant="outline" className="text-yellow-400 border-yellow-400 text-xs">
              ⚠️ 接続再試行中...
            </Badge>
          )}
        </div>
        {summary ? (
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {summary}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 italic">
            録音開始から1分後に自動生成されます
          </p>
        )}
      </div>

      {/* タイムライン */}
      <ScrollArea className="flex-1 p-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
            <p className="text-sm">録音ボタンを押して会議を開始してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="border border-zinc-800 rounded-xl p-3 bg-zinc-900"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-zinc-500 font-mono">
                    {entry.timestamp}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-xs text-zinc-400 border-zinc-700"
                  >
                    Whisper
                  </Badge>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </ScrollArea>
    </div>
  );
}
