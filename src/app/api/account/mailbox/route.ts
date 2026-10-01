import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { currentUser, hasValidOrigin, unauthorized } from "@/lib/auth";
import { sql } from "@/lib/db";
import { assertPublicSmtpHost, encryptSecret, getMailbox, publicMailbox } from "@/lib/mailbox";
import { verifyTransport } from "@/lib/email/sender";
import { env } from "@/lib/env";
import { mailboxInput } from "@/lib/mailbox-input";

export const runtime = "nodejs";

export const GET = apiRoute(async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ mailbox: publicMailbox(await getMailbox(user.id)) });
});

export const PUT = apiRoute(async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    env.credentialsEncryptionKey;
  } catch {
    return NextResponse.json({ error: "Mailbox storage is not configured. Set CREDENTIALS_ENCRYPTION_KEY in the server environment and restart the server." }, { status: 503 });
  }
  const parsed = mailboxInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
  }
  const input = parsed.data;
  const existing = await getMailbox(user.id);
  if (existing?.auth_type === "google") {
    if (input.host !== "smtp.gmail.com" || input.port !== 587 || input.secure || input.username !== existing.username || input.fromEmail !== existing.username || input.password) {
      return NextResponse.json({ error: "Google manages your mailbox credentials. Disconnect Google before changing the sending account." }, { status: 400 });
    }
    await sql(`UPDATE mailboxes SET from_name=$2, reply_to=$3, postal_address=$4,
      max_sends_per_day=$5, seconds_between=$6, updated_at=now() WHERE user_id=$1`,
      [user.id, input.fromName, input.replyTo, input.postalAddress, input.maxSendsPerDay, input.secondsBetween]);
    return NextResponse.json({ mailbox: publicMailbox(await getMailbox(user.id)) });
  }
  const host = String(input.host ?? "").trim();
  const port = Number(input.port);
  const username = String(input.username ?? "").trim();
  const fromEmail = String(input.fromEmail ?? "").trim().toLowerCase();
  const postalAddress = String(input.postalAddress ?? "").trim();
  const password = String(input.password ?? "");
  const maxSends = input.maxSendsPerDay;
  const secondsBetween = input.secondsBetween;
  if (!password && !existing) return NextResponse.json({ error: "SMTP password is required." }, { status: 400 });
  if (!password && existing && (host !== existing.host || username !== existing.username)) {
    return NextResponse.json({ error: "Enter the SMTP password again when changing the host or username." }, { status: 400 });
  }
  try {
    await assertPublicSmtpHost(host);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid SMTP host." }, { status: 400 });
  }
  const encrypted = password ? encryptSecret(password) : existing!.password_encrypted;
  await sql(
    `INSERT INTO mailboxes (user_id, host, port, secure, username, password_encrypted, from_name,
      from_email, reply_to, postal_address, max_sends_per_day, seconds_between, verified_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,now())
     ON CONFLICT (user_id) DO UPDATE SET host=excluded.host, port=excluded.port,
      secure=excluded.secure, username=excluded.username, password_encrypted=excluded.password_encrypted,
      from_name=excluded.from_name, from_email=excluded.from_email, reply_to=excluded.reply_to,
      postal_address=excluded.postal_address, max_sends_per_day=excluded.max_sends_per_day,
      seconds_between=excluded.seconds_between, verified_at=NULL, updated_at=now()`,
    [user.id, host, port, Boolean(input.secure), username, encrypted, String(input.fromName ?? "").trim(),
      fromEmail, String(input.replyTo ?? "").trim(), postalAddress, maxSends, secondsBetween],
  );
  return NextResponse.json({ mailbox: publicMailbox(await getMailbox(user.id)) });
});

export const POST = apiRoute(async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const mailbox = await getMailbox(user.id);
  if (!mailbox) return NextResponse.json({ error: "Save mailbox settings first." }, { status: 400 });
  const result = await verifyTransport(mailbox);
  if (!result.ok) return NextResponse.json({ error: `Connection failed: ${result.error}` }, { status: 502 });
  await sql("UPDATE mailboxes SET verified_at = now(), updated_at = now() WHERE user_id = $1", [user.id]);
  return NextResponse.json({ ok: true, mailbox: publicMailbox(await getMailbox(user.id)) });
});

export const DELETE = apiRoute(async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!(await hasValidOrigin(req))) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  await sql("DELETE FROM mailboxes WHERE user_id = $1", [user.id]);
  return NextResponse.json({ ok: true });
});
