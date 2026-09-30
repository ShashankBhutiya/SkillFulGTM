import { NextResponse } from "next/server";
import { currentUser, hasValidOrigin, unauthorized } from "@/lib/auth";
import { issueAuthToken, sendAuthEmail } from "@/lib/auth-mail";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!user.email_verified) {
    const token = await issueAuthToken(user.id, "verify", 24 * 60);
    await sendAuthEmail(user.email, "verify", token);
  }
  return NextResponse.json({ ok: true });
}
