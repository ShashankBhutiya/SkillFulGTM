import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { authTokenHash } from "@/lib/auth-mail";
import { tx } from "@/lib/db";
import { env } from "@/lib/env";

export const GET = apiRoute(async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${env.baseUrl}/login?error=invalid-verification`);
  const consumed = await tx(async (client) => {
    const result = await client.query<{ user_id: string }>(
      "DELETE FROM auth_tokens WHERE token_hash = $1 AND kind = 'verify' AND expires_at > now() RETURNING user_id",
      [authTokenHash(token)],
    );
    const found = result.rows[0];
    if (!found) return false;
    await client.query("UPDATE users SET email_verified = TRUE WHERE id = $1", [found.user_id]);
    return true;
  });
  if (!consumed) return NextResponse.redirect(`${env.baseUrl}/login?error=invalid-verification`);
  return NextResponse.redirect(`${env.baseUrl}/account?verified=1`);
});
