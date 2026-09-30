import { apiRoute, jsonObject } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { findUserByEmail, hasValidOrigin } from "@/lib/auth";
import { issueAuthToken, sendAuthEmail } from "@/lib/auth-mail";

export const POST = apiRoute(async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { email } = await jsonObject(req);
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const user = await findUserByEmail(email);
  if (user) {
    const token = await issueAuthToken(user.id, "reset", 60);
    await sendAuthEmail(user.email, "reset", token);
  }
  return NextResponse.json({ ok: true });
});
