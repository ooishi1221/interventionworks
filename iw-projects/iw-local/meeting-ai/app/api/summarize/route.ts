import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json();

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json({ summary: "" });
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `以下は会議の文字起こしです。3〜5行で要点を箇条書きにまとめてください。\n\n${transcript}`,
        },
      ],
    });

    const summary =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Summarization failed" },
      { status: 500 }
    );
  }
}
