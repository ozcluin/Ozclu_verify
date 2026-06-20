import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: "Signup is disabled and not supported." }, { status: 403 });
}
