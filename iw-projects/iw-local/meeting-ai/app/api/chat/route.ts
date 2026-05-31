import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

function loadMemoryFiles(): string {
  const memoryDir = path.join(process.cwd(), "docs", "memory");
  if (!fs.existsSync(memoryDir)) return "";

  const files = fs
    .readdirSync(memoryDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md");

  if (files.length === 0) return "";

  const contents = files.map((file) => {
    const filePath = path.join(memoryDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    return `## ${file}\n${content}`;
  });

  return contents.join("\n\n---\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const { question, transcript } = await req.json();

    if (!question || question.trim().length === 0) {
      return new Response("Empty question", { status: 400 });
    }

    const memoryContent = loadMemoryFiles();

    const systemPrompt = `あなたは会議中のリアルタイムAIアシスタントです。
会議の文字起こしとプロジェクトメモリーを踏まえて、的確で簡潔な回答をしてください。

${
  memoryContent
    ? `## プロジェクトメモリー（事前知識）\n${memoryContent}\n\n---\n`
    : ""
}

## 現在の会議文字起こし
${transcript && transcript.trim().length > 0 ? transcript : "（まだ文字起こしデータなし）"}`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response("Chat failed", { status: 500 });
  }
}
