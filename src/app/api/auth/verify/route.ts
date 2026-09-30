import { NextResponse } from "next/server";
import { authTokenHash } from "@/lib/auth-mail";
import { sql, tx } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${env.baseUrl}/login?error=invalid-verification`);
  const rows = await sql<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM auth_tokens WHERE token_hash = $1 AND kind = 'verify' AND expires_at > now()",
    [authTokenHash(token)],
  );
  const found = rows[0];
  if (!found) return NextResponse.redirect(`${env.baseUrl}/login?error=invalid-verification`);
  await tx(async (client) => {
    await client.query("UPDATE users SET email_verified = TRUE WHERE id = $1", [found.user_id]);
    await client.query("DELETE FROM auth_tokens WHERE id = $1", [found.id]);
  });
  return NextResponse.redirect(`${env.baseUrl}/account?verified=1`);
}
