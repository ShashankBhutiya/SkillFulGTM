import { NextResponse } from "next/server";
import { createSession, findUserByEmail, hasValidOrigin, setSessionCookie, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { email, password } = (await req.json()) as Record<string, string>;
  const normalized = email?.trim().toLowerCase() ?? "";
  await sql("DELETE FROM login_attempts WHERE attempted_at <= now() - interval '1 day'");
  const attempts = await sql<{ n: string }>(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE email = $1 AND attempted_at > now() - interval '15 minutes'",
    [normalized],
  );
  if (Number(attempts[0]?.n ?? 0) >= 10) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const user = normalized ? await findUserByEmail(normalized) : undefined;
  if (!user || !password || !(await verifyPassword(password, user.password_hash))) {
    await sql("INSERT INTO login_attempts (email) VALUES ($1)", [normalized || "unknown"]);
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  await sql("DELETE FROM login_attempts WHERE email = $1", [normalized]);
  const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  setSessionCookie(response, await createSession(user.id));
  return response;
}
