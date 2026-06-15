import { NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "";

export async function GET() {
  if (!BACKEND) return NextResponse.json({ skipped: true });
  try {
    const res = await fetch(`${BACKEND}/health`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json({ ok: true, backend: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 502 }
    );
  }
}
