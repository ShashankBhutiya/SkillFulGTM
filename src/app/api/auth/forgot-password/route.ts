import { NextResponse } from "next/server";
import { findUserByEmail, hasValidOrigin } from "@/lib/auth";
import { issueAuthToken, sendAuthEmail } from "@/lib/auth-mail";

export async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { email } = (await req.json()) as { email?: string };
  const user = email ? await findUserByEmail(email) : undefined;
  if (user) {
    const token = await issueAuthToken(user.id, "reset", 60);
    await sendAuthEmail(user.email, "reset", token);
  }
  return NextResponse.json({ ok: true });
}
