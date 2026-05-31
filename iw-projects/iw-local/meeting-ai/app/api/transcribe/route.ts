import { NextRequest, NextResponse } from "next/server";

const WHISPER_SERVER_URL = "http://localhost:8767/transcribe";

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
    return NextResponse.json({ text: data.text ?? "" });
  } catch (error) {
    console.error("Transcribe error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
