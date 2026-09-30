import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { env } from "./env";
import { newId, sql } from "./db";

export function authMailConfigured(): boolean {
  const config = env.authMail;
  return Boolean(config.host && config.user && config.pass && config.from);
}

export async function issueAuthToken(userId: string, kind: "verify" | "reset", minutes: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql("DELETE FROM auth_tokens WHERE expires_at <= now() OR (user_id = $1 AND kind = $2)", [userId, kind]);
  await sql(
    `INSERT INTO auth_tokens (id, user_id, token_hash, kind, expires_at)
     VALUES ($1,$2,$3,$4,now() + ($5 * interval '1 minute'))`,
    [newId("tok"), userId, hash, kind, minutes],
  );
  return token;
}

export function authTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendAuthEmail(to: string, kind: "verify" | "reset", token: string): Promise<void> {
  const config = env.authMail;
  if (!authMailConfigured()) {
    if (process.env.NODE_ENV === "production" && !env.baseUrlIsLocal) {
      throw new Error("Account email delivery is not configured.");
    }
    console.info(`[development] ${kind} link: ${link(kind, token)}`);
    return;
  }
  const url = link(kind, token);
  await nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.user, pass: config.pass } }).sendMail({
    from: config.from,
    to,
    subject: kind === "verify" ? "Verify your SkillfulGTM account" : "Reset your SkillfulGTM password",
    text: `${kind === "verify" ? "Verify your account" : "Reset your password"}: ${url}\n\nThis link expires soon. If you did not request it, ignore this email.`,
    html: `<p>${kind === "verify" ? "Verify your account" : "Reset your password"}:</p><p><a href="${url}">${url}</a></p><p>This link expires soon. If you did not request it, ignore this email.</p>`,
  });
}

function link(kind: "verify" | "reset", token: string): string {
  return kind === "verify" ? `${env.baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}` : `${env.baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}
