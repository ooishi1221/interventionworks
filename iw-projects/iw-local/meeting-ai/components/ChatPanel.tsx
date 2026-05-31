"use client";

import { useRef, useEffect } from "react";
import { TimelineEntry } from "@/components/Timeline";

interface ChatPanelProps {
  transcript: string;
  entries?: TimelineEntry[];
  onRemoveEntry?: (id: string) => void;
  onClearAll?: () => void;
  onRemoveNoise?: () => void;
  isRecording?: boolean;
  onBookmark?: () => void;
  onCopyAll?: () => void;
  copyDone?: boolean;
}

export default function ChatPanel({
  entries = [],
  onRemoveEntry,
  onClearAll,
  onRemoveNoise,
  isRecording,
  onBookmark,
  onCopyAll,
  copyDone,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries]);

  const transcriptEntries = entries.filter((e) => e.type === "transcript");

  return (
    <div className="flex flex-col h-full">
      {/* パネルヘッダー */}
      <div className="border-b border-zinc-800/60 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">全文起こし</span>
          {transcriptEntries.length > 0 && (
            <span className="text-xs tabular-nums text-zinc-700">
              {transcriptEntries.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* ブックマーク: 録音中のみ表示 */}
          {isRecording && onBookmark && (
            <button
              onClick={onBookmark}
              className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors min-h-[32px] px-1"
              aria-label="ブックマーク"
            >
              ★
            </button>
          )}
          {/* コピーボタン用スペース (アンディ追加予定) */}
          {onCopyAll && (
            <button
              onClick={onCopyAll}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors min-h-[32px]"
            >
              {copyDone ? "コピー済 ✓" : "コピー"}
            </button>
          )}
          {onRemoveNoise && (
            <button
              onClick={onRemoveNoise}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors min-h-[32px]"
            >
              ノイズ削除
            </button>
          )}
          {onClearAll && (
            <button
              onClick={onClearAll}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors min-h-[32px]"
            >
              全削除
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          {transcriptEntries.length === 0 ? (
            <div className="flex items-center justify-center h-28">
              <p className="text-sm text-zinc-700">
                {isRecording ? "音声を処理中..." : "録音を開始すると文字が流れます"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {transcriptEntries.map((entry) => (
                <div key={entry.id} className="flex gap-3 text-sm group">
                  <span className="text-zinc-700 shrink-0 text-[11px] pt-[3px] font-mono tabular-nums leading-5">
                    {entry.timestamp}
                  </span>
                  <span className="text-zinc-200 leading-relaxed flex-1">{entry.text}</span>
                  {onRemoveEntry && (
                    <button
                      onClick={() => onRemoveEntry(entry.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400 transition-opacity shrink-0 text-xs px-1 min-h-[24px]"
                      aria-label="削除"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
