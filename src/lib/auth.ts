import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { newId, sql, tx, type UserRow } from "./db";

const scrypt = promisify(scryptCallback);
const COOKIE = "skillful_session";
const SESSION_DAYS = 30;

export type SafeUser = Pick<UserRow, "id" | "email" | "name" | "created_at" | "email_verified">;

const safe = (user: UserRow): SafeUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  created_at: user.created_at,
  email_verified: user.email_verified,
});

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = stored.split(":");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scrypt(password, Buffer.from(saltText, "base64url"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql("DELETE FROM sessions WHERE expires_at <= now()");
  await sql(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
    [newId("ses"), userId, tokenHash(token)],
  );
  return token;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function currentUser(): Promise<SafeUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<UserRow>(
    `SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > now() LIMIT 1`,
    [tokenHash(token)],
  );
  return rows[0] ? safe(rows[0]) : null;
}

export async function requireUser(): Promise<SafeUser> {
  const user = await currentUser();
  if (!user) throw new AuthError();
  return user;
}

export class AuthError extends Error {
  constructor() {
    super("Sign in to continue.");
  }
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}

/** SameSite cookies provide the primary CSRF boundary; this also rejects cross-origin mutations. */
export async function hasValidOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = (await headers()).get("x-forwarded-host");
  const host = forwardedHost ?? (await headers()).get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function registerUser(name: string, email: string, password: string): Promise<SafeUser> {
  const id = newId("usr");
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  return tx(async (client) => {
    // Serialize the legacy ownership migration if two signups arrive together.
    await client.query("SELECT pg_advisory_xact_lock(71029001)");
    const count = await client.query<{ n: string }>("SELECT COUNT(*) AS n FROM users");
    const firstUser = Number(count.rows[0]?.n ?? 0) === 0;
    const result = await client.query<UserRow>(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, normalized, name.trim(), passwordHash],
    );
    if (firstUser) {
      await client.query("UPDATE campaigns SET user_id = $1 WHERE user_id IS NULL", [id]);
      await client.query("UPDATE sends SET user_id = $1 WHERE user_id IS NULL", [id]);
      await client.query("UPDATE email_templates SET user_id = $1 WHERE user_id IS NULL", [id]);
      await client.query(
        `INSERT INTO user_suppression (user_id, email, reason, created_at)
         SELECT $1, email, reason, created_at FROM suppression
         ON CONFLICT (user_id, email) DO NOTHING`,
        [id],
      );
    }
    return safe(result.rows[0]!);
  });
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return (await sql<UserRow>("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]))[0];
}

export async function deleteCurrentSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await sql("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
}
