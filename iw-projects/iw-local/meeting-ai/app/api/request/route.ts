import { NextRequest, NextResponse } from "next/server";
import { updateRequest } from "@/lib/meeting-file";

export async function POST(req: NextRequest) {
  try {
    const { items, memo } = await req.json() as { items: string[]; memo: string };
    await updateRequest(items ?? [], memo ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Request update error:", error);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}
