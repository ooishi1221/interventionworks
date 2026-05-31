import { NextRequest, NextResponse } from "next/server";
import { appendTranscript } from "@/lib/meeting-file";

const WHISPER_SERVER_URL = "http://127.0.0.1:8767/transcribe";

export async function POST(req: NextRequest) {
  try {
    const { audioBase64, mimeType } = await req.json();

    if (!audioBase64) {
      return NextResponse.json({ error: "No audio data" }, { status: 400 });
    }

    const res = await fetch(WHISPER_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64, mimeType }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Whisper server error:", err);
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text: string = data.text ?? "";

    // ファイルへの追記（失敗しても録音は止めない）
    if (text.trim().length > 0) {
      await appendTranscript(text.trim());
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Transcribe error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
