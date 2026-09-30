import { NextResponse } from "next/server";
import { clearSessionCookie, deleteCurrentSession, hasValidOrigin } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  await deleteCurrentSession();
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
