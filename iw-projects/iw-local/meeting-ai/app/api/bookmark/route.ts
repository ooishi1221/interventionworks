import { NextRequest, NextResponse } from "next/server";
import { appendBookmark } from "@/lib/meeting-file";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    await appendBookmark(text ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Bookmark error:", error);
    return NextResponse.json({ error: "Bookmark failed" }, { status: 500 });
  }
}
