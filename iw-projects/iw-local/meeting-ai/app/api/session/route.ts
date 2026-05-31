import { NextRequest, NextResponse } from "next/server";
import { startSession, endSession } from "@/lib/meeting-file";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (action === "start") {
      await startSession();
      return NextResponse.json({ ok: true, action: "start" });
    }

    if (action === "end") {
      await endSession();
      return NextResponse.json({ ok: true, action: "end" });
    }

    return NextResponse.json({ error: "action must be start or end" }, { status: 400 });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ error: "Session operation failed" }, { status: 500 });
  }
}
