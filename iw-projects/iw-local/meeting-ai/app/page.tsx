"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Timeline, { TimelineEntry } from "@/components/Timeline";
import ChatPanel from "@/components/ChatPanel";

const CHUNK_INTERVAL_MS = 8000;
const SUMMARY_INTERVAL_MS = 60000;
const RMS_THRESHOLD = 0.0005;

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getTimestamp() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function callSession(action: "start" | "end"): Promise<void> {
  try {
    await fetch(`/api/session?action=${action}`, { method: "POST" });
  } catch (err) {
    console.error(`Session ${action} error:`, err);
  }
}

export default function MeetingPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [summary, setSummary] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [copyDone, setCopyDone] = useState(false);
  const [mobileTab, setMobileTab] = useState<"transcript" | "summary">("transcript");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptBufferRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);

  const isAudioSilent = useCallback(
    async (blob: Blob): Promise<boolean> => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = audioContextRef.current || new AudioContext();
        audioContextRef.current = audioCtx;
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const data = audioBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        return rms < RMS_THRESHOLD;
      } catch {
        return false;
      }
    },
    []
  );

  const sendChunk = useCallback(
    async (blob: Blob, retryCount = 0): Promise<void> => {
      try {
        setRetrying(retryCount > 0);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const base64 = btoa(binary);
        const mimeType = blob.type || "audio/webm";

        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: base64, mimeType }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { text } = await res.json();
        setRetrying(false);

        if (text && text.trim().length > 0) {
          const entry: TimelineEntry = {
            id: generateId("tl"),
            timestamp: getTimestamp(),
            text: text.trim(),
            type: "transcript",
          };
          setEntries((prev) => [...prev, entry]);
          transcriptBufferRef.current += `\n${text.trim()}`;
          setTranscript(transcriptBufferRef.current);
        }
      } catch (err) {
        console.error("Send chunk error:", err);
        if (retryCount < 3) {
          setTimeout(() => sendChunk(blob, retryCount + 1), 1000 * (retryCount + 1));
        } else {
          setRetrying(false);
        }
      }
    },
    [isAudioSilent]
  );

  const runSummary = useCallback(async () => {
    const buf = transcriptBufferRef.current;
    if (!buf.trim()) return;

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: buf }),
      });
      if (!res.ok) return;
      const { summary: newSummary } = await res.json();
      if (newSummary) setSummary(newSummary);
    } catch (err) {
      console.error("Summary error:", err);
    }
  }, []);

  const startRecording = useCallback(async () => {
    await callSession("start");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const startChunk = () => {
        mediaRecorder.start();
        chunkTimerRef.current = setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, CHUNK_INTERVAL_MS);
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          sendChunk(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (isRecording || mediaRecorderRef.current === mediaRecorder) {
          if (streamRef.current?.active) {
            startChunk();
          }
        }
      };

      startChunk();
      setIsRecording(true);

      summaryTimerRef.current = setInterval(runSummary, SUMMARY_INTERVAL_MS);
    } catch (err) {
      console.error("Start recording error:", err);
      alert("マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。");
    }
  }, [isRecording, sendChunk, runSummary]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);

    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (summaryTimerRef.current) {
      clearInterval(summaryTimerRef.current);
      summaryTimerRef.current = null;
    }

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    mediaRecorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    runSummary();
    await callSession("end");
    // セッション保存
    try {
      await fetch("/api/session?action=save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
    } catch (err) {
      console.error("Session save error:", err);
    }
  }, [runSummary, summary]);

  useEffect(() => {
    return () => {
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (summaryTimerRef.current) clearInterval(summaryTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  void chunksRef;

  const addBookmark = useCallback(() => {
    const lastTranscript = entries.filter((e) => e.type === "transcript").slice(-1)[0];
    const label = lastTranscript ? lastTranscript.text.slice(0, 40) : "（発言なし）";
    const entry: TimelineEntry = {
      id: generateId("bm"),
      timestamp: getTimestamp(),
      text: label,
      type: "bookmark",
    };
    setEntries((prev) => [...prev, entry]);
    fetch("/api/bookmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: label }),
    }).catch(console.error);
  }, [entries]);

  const copyAll = useCallback(async () => {
    const text = entries
      .filter((e) => e.type === "transcript")
      .map((e) => `[${e.timestamp}] ${e.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }, [entries]);

  const RecordButton = (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`relative flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-semibold transition-colors duration-200 min-h-[44px] select-none ${
        isRecording
          ? "bg-red-600 hover:bg-red-500 text-white rec-ripple"
          : "bg-blue-600 hover:bg-blue-500 text-white"
      }`}
    >
      {isRecording ? (
        <>
          <span className="relative z-10 w-2.5 h-2.5 rounded-sm bg-white" />
          <span className="relative z-10">録音停止</span>
        </>
      ) : (
        <>
          <span className="w-2.5 h-2.5 rounded-full bg-white" />
          録音開始
        </>
      )}
    </button>
  );

  const noiseFilter = (prev: TimelineEntry[]) =>
    prev.filter((e) => {
      const NOISE = ["ご視聴ありがとう", "日本語の会議", "人名・地名", "次回予告", "チャンネル登録"];
      return !NOISE.some((n) => e.text.includes(n));
    });

  return (
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100">

      {/* PC ヘッダー */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">meeting-ai</span>
          {retrying && <span className="text-xs text-yellow-500 animate-pulse">再試行中...</span>}
        </div>
        <div className="flex items-center gap-3">
          <a href="/sessions" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">履歴</a>
          {RecordButton}
        </div>
      </header>

      {/* モバイル タブバー */}
      <div className="md:hidden shrink-0 flex border-b border-zinc-800/60">
        <button
          onClick={() => setMobileTab("transcript")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mobileTab === "transcript" ? "text-zinc-100 border-b-2 border-blue-500" : "text-zinc-500"
          }`}
        >
          全文起こし
        </button>
        <button
          onClick={() => setMobileTab("summary")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mobileTab === "summary" ? "text-zinc-100 border-b-2 border-blue-500" : "text-zinc-500"
          }`}
        >
          要約
        </button>
      </div>

      {/* メインコンテンツ */}
      <main className="flex flex-1 overflow-hidden flex-col md:flex-row">

        {/* 全文起こし: PCは常時表示、モバイルはtranscriptタブ時のみ */}
        <div className={`${mobileTab === "transcript" ? "flex" : "hidden"} md:flex flex-1 md:w-1/2 md:border-r border-zinc-800/60 overflow-hidden flex-col`}>
          <ChatPanel
            transcript={transcript}
            entries={entries}
            onRemoveEntry={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
            onClearAll={() => setEntries([])}
            onRemoveNoise={() => setEntries(noiseFilter)}
            isRecording={isRecording}
            onBookmark={addBookmark}
            onCopyAll={copyAll}
            copyDone={copyDone}
          />
        </div>

        {/* 要約: PCは常時表示、モバイルはsummaryタブ時のみ */}
        <div className={`${mobileTab === "summary" ? "flex" : "hidden"} md:flex flex-1 md:w-1/2 overflow-hidden flex-col`}>
          <Timeline
            entries={entries}
            summary={summary}
            isRecording={isRecording}
            retrying={retrying}
          />
        </div>

      </main>

      {/* モバイル フッターナビ */}
      <nav className="md:hidden shrink-0 border-t border-zinc-800/60 bg-zinc-900/95 backdrop-blur-sm pb-safe">
        <div className="flex items-center justify-around px-4 py-2">
          <a
            href="/sessions"
            className="flex flex-col items-center gap-0.5 text-zinc-500 hover:text-zinc-300 transition-colors min-w-[60px] py-1"
          >
            <span className="text-lg">📁</span>
            <span className="text-[10px]">履歴</span>
          </a>
          <div className="flex flex-col items-center gap-0.5">
            {RecordButton}
          </div>
          <button
            onClick={addBookmark}
            disabled={!isRecording}
            className="flex flex-col items-center gap-0.5 text-zinc-500 hover:text-yellow-400 disabled:opacity-30 transition-colors min-w-[60px] py-1"
          >
            <span className="text-lg">★</span>
            <span className="text-[10px]">マーク</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
