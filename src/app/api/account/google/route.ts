import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, hasValidOrigin, unauthorized } from "@/lib/auth";
import { env } from "@/lib/env";
import { encryptSecret } from "@/lib/mailbox";
import { apiRoute } from "@/lib/api-route";

export const runtime = "nodejs";
export const POST = apiRoute(async (req: Request) => {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let config;
  try { config = env.googleOAuth; env.credentialsEncryptionKey; }
  catch { return NextResponse.json({ error: "Google connection needs server setup: configure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, APP_BASE_URL, and CREDENTIALS_ENCRYPTION_KEY." }, { status: 503 }); }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: "code", scope: "openid email https://mail.google.com/", access_type: "offline",
    prompt: "consent select_account", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  const response = NextResponse.json({ url: url.toString() });
  response.cookies.set("google_mailbox_oauth", encryptSecret(JSON.stringify({ state, verifier, userId: user.id, expires: Date.now() + 600_000 })),
    { httpOnly: true, secure: new URL(config.redirectUri).protocol === "https:", sameSite: "lax", path: "/api/account/google/callback", maxAge: 600 });
  return response;
});
