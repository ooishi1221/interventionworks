"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Timeline, { TimelineEntry } from "@/components/Timeline";
import ChatPanel from "@/components/ChatPanel";

const CHUNK_INTERVAL_MS = 4000; // 4秒チャンク
const SUMMARY_INTERVAL_MS = 60000; // 1分バッチ要約
const RMS_THRESHOLD = 0.01; // 無音検出閾値

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
  const [transcript, setTranscript] = useState(""); // Q&A 用バッファ

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptBufferRef = useRef(""); // ref版バッファ（タイマー内で使う）
  const streamRef = useRef<MediaStream | null>(null);

  // RMS 計算で無音チェック
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
        return false; // デコード失敗なら送信する
      }
    },
    []
  );

  // 音声チャンクをAPIに送信
  const sendChunk = useCallback(
    async (blob: Blob, retryCount = 0): Promise<void> => {
      const silent = await isAudioSilent(blob);
      if (silent) return;

      try {
        setRetrying(retryCount > 0);
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(arrayBuffer))
        );
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

  // 1分バッチ要約
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
    // セッション開始: current.txt をクリアして開始行を書く
    await callSession("start");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // チャンクタイマー: 4秒ごとに stop → ondataavailable → start
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
          // 録音継続中なら次のチャンク開始
          if (streamRef.current?.active) {
            startChunk();
          }
        }
      };

      startChunk();
      setIsRecording(true);

      // 1分バッチ要約タイマー
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

    // 停止時に最終要約
    runSummary();

    // セッション終了: 終了行を追記してアーカイブに保存
    await callSession("end");
  }, [runSummary]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (summaryTimerRef.current) clearInterval(summaryTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // chunksRef は現在未使用（将来の拡張用）
  void chunksRef;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900">
        <div>
          <h1 className="text-base font-semibold">meeting-ai</h1>
          <p className="text-xs text-zinc-500">リアルタイムAI議事録アシスタント</p>
        </div>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
            isRecording
              ? "bg-red-600 hover:bg-red-500 text-white"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              録音停止
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-white" />
              録音開始
            </>
          )}
        </button>
      </header>

      {/* 2カラムレイアウト */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左: タイムライン */}
        <div className="w-1/2 border-r border-zinc-800 overflow-hidden flex flex-col">
          <Timeline
            entries={entries}
            summary={summary}
            isRecording={isRecording}
            retrying={retrying}
          />
        </div>

        {/* 右: チャット */}
        <div className="w-1/2 overflow-hidden flex flex-col">
          <ChatPanel transcript={transcript} />
        </div>
      </main>
    </div>
  );
}
