import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { sql } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/mailbox";

export const runtime = "nodejs";
export async function GET(req: Request) {
  const finish = (status: string) => {
    const response = NextResponse.redirect(new URL(`/account?google=${status}`, env.baseUrl));
    response.cookies.set("google_mailbox_oauth", "", { httpOnly: true, sameSite: "lax", path: "/api/account/google/callback", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  try {
    const user = await currentUser();
    const cookie = (await cookies()).get("google_mailbox_oauth")?.value;
    if (!user || !cookie) return finish("expired");
    const saved = JSON.parse(decryptSecret(cookie)) as { state: string; verifier: string; userId: string; expires: number };
    const query = new URL(req.url).searchParams;
    if (saved.userId !== user.id || saved.expires < Date.now() || !query.get("state") || query.get("state") !== saved.state) return finish("expired");
    if (query.has("error")) return finish("cancelled");
    const code = query.get("code");
    if (!code) return finish("failed");
    const config = env.googleOAuth;
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: saved.verifier }) });
    const tokens = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
    if (!response.ok || !tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes("https://mail.google.com/")) return finish("permissions");
    const identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15_000) });
    const identity = await identityResponse.json() as { email?: string; email_verified?: boolean };
    if (!identityResponse.ok || !identity.email_verified || !identity.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) return finish("failed");
    const email = identity.email.toLowerCase();
    await sql(`INSERT INTO mailboxes (user_id, host, port, secure, username, password_encrypted, from_email, postal_address, auth_type, verified_at)
      VALUES ($1,'smtp.gmail.com',587,false,$2,$3,$2,'','google',NULL)
      ON CONFLICT (user_id) DO UPDATE SET host='smtp.gmail.com', port=587, secure=false, username=$2,
      password_encrypted=$3, from_email=$2, auth_type='google', verified_at=NULL, updated_at=now()`,
      [user.id, email, encryptSecret(tokens.refresh_token)]);
    return finish("connected");
  } catch { return finish("failed"); }
}
