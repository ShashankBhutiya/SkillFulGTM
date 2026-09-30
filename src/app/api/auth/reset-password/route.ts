import { NextResponse } from "next/server";
import { hasValidOrigin, hashPassword } from "@/lib/auth";
import { authTokenHash } from "@/lib/auth-mail";
import { sql, tx } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { token, password } = (await req.json()) as { token?: string; password?: string };
  if (!token || !password || password.length < 12 || password.length > 200) {
    return NextResponse.json({ error: "Use a password with at least 12 characters." }, { status: 400 });
  }
  const found = (await sql<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM auth_tokens WHERE token_hash = $1 AND kind = 'reset' AND expires_at > now()",
    [authTokenHash(token)],
  ))[0];
  if (!found) return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  const passwordHash = await hashPassword(password);
  await tx(async (client) => {
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, found.user_id]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [found.user_id]);
    await client.query("DELETE FROM auth_tokens WHERE user_id = $1 AND kind = 'reset'", [found.user_id]);
  });
  return NextResponse.json({ ok: true });
}
