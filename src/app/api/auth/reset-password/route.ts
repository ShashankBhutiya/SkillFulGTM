import { apiRoute, jsonObject } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { hasValidOrigin, hashPassword } from "@/lib/auth";
import { authTokenHash } from "@/lib/auth-mail";
import { tx } from "@/lib/db";

export const POST = apiRoute(async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { token, password } = await jsonObject(req);
  if (typeof token !== "string" || !token || token.length > 200 || typeof password !== "string" || password.length < 12 || password.length > 200) {
    return NextResponse.json({ error: "Use a password with at least 12 characters." }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  const consumed = await tx(async (client) => {
    const result = await client.query<{ user_id: string }>(
      "DELETE FROM auth_tokens WHERE token_hash = $1 AND kind = 'reset' AND expires_at > now() RETURNING user_id",
      [authTokenHash(token)],
    );
    const found = result.rows[0];
    if (!found) return false;
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, found.user_id]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [found.user_id]);
    await client.query("DELETE FROM auth_tokens WHERE user_id = $1 AND kind = 'reset'", [found.user_id]);
    return true;
  });
  if (!consumed) return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  return NextResponse.json({ ok: true });
});
