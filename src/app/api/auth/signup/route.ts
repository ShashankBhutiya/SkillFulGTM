import { apiRoute, jsonObject } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { createSession, findUserByEmail, hasValidOrigin, registerUser, setSessionCookie } from "@/lib/auth";
import { authMailConfigured, issueAuthToken, sendAuthEmail } from "@/lib/auth-mail";
import { env } from "@/lib/env";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export const POST = apiRoute(async function POST(req: Request) {
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { name, email, password } = await jsonObject(req);
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (typeof name !== "string" || !name.trim() || name.length > 100 || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return NextResponse.json({ error: "Enter your name and a valid email address." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 200) {
    return NextResponse.json({ error: "Use a password with at least 12 characters." }, { status: 400 });
  }
  const requestHost = new URL(req.url).hostname.toLowerCase();
  const localRequest = requestHost === "localhost" || requestHost === "127.0.0.1" || requestHost === "::1";
  const localWithoutMailer = localRequest && env.baseUrlIsLocal && !authMailConfigured();
  if (!localWithoutMailer && !authMailConfigured()) {
    return NextResponse.json({ error: "Account email delivery is not configured." }, { status: 503 });
  }
  if (await findUserByEmail(normalized)) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }
  try {
    const user = await registerUser(name, normalized, password);
    let warning: string | undefined;
    if (localWithoutMailer) {
      await sql("UPDATE users SET email_verified = TRUE WHERE id = $1", [user.id]);
      user.email_verified = true;
    } else {
      const verifyToken = await issueAuthToken(user.id, "verify", 24 * 60);
      try {
        await sendAuthEmail(user.email, "verify", verifyToken);
      } catch {
        warning = "Your account was created, but the verification email could not be delivered. Please resend it from Account settings.";
      }
    }
    const response = NextResponse.json({ user, warning }, { status: 201 });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    throw error;
  }
});
