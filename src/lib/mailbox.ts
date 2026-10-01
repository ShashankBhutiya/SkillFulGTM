import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "./env";
import { sql, type MailboxRow } from "./db";

export type MailboxConfig = MailboxRow & {
  password: string;
  verified_at: string | null;
};

function key(): Buffer {
  return createHash("sha256").update(env.credentialsEncryptionKey).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Stored mailbox credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getMailbox(userId: string): Promise<MailboxConfig | null> {
  const row = (await sql<MailboxRow>("SELECT * FROM mailboxes WHERE user_id = $1", [userId]))[0];
  if (!row) return null;
  return { ...row, password: decryptSecret(row.password_encrypted) };
}

export function publicMailbox(row: MailboxConfig | null) {
  if (!row) return null;
  return {
    authType: row.auth_type ?? "password",
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    postalAddress: row.postal_address,
    maxSendsPerDay: row.max_sends_per_day,
    secondsBetween: row.seconds_between,
    verifiedAt: row.verified_at,
    hasPassword: Boolean(row.password),
  };
}

function privateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
  }
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
}

export async function assertPublicSmtpHost(host: string): Promise<void> {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".local")) throw new Error("SMTP host must be a public mail server.");
  const addresses = await lookup(normalized, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
    throw new Error("SMTP host cannot resolve to a private or local network address.");
  }
}
