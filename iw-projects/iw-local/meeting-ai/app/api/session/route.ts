import { NextRequest, NextResponse } from "next/server";
import { startSession, endSession, saveSession } from "@/lib/meeting-file";

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

    if (action === "save") {
      const body = await req.json().catch(() => ({}));
      const filepath = await saveSession(body.summary ?? "");
      return NextResponse.json({ ok: true, filepath });
    }

    return NextResponse.json({ error: "action must be start, end, or save" }, { status: 400 });
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ error: "Session operation failed" }, { status: 500 });
  }
}
