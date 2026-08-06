import { sql, store } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

function page(title: string, message: string, form?: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fafafa;margin:0;padding:64px 20px">
<div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px">
<h1 style="margin:0 0 12px;font-size:19px;color:#111">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.55;color:#52525b">${message}</p>
${form ?? ""}
</div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * GET only *offers* the opt-out. Corporate link scanners follow every URL in an
 * inbound email, so an unsubscribe that fires on GET silently opts people out
 * who never clicked. The actual change happens on POST — which is also what
 * RFC 8058 one-click unsubscribe sends.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return page("Link not valid", "This unsubscribe link is invalid or has been altered.");
  }

  if (await store.isSuppressed(email)) {
    return page("Already unsubscribed", `<b>${email}</b> will not receive further messages.`);
  }

  return page(
    "Unsubscribe",
    `Confirm that <b>${email}</b> should stop receiving these emails.`,
    `<form method="post" style="margin-top:20px">
<button type="submit" style="background:#111;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Unsubscribe me</button>
</form>`,
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return page("Link not valid", "This unsubscribe link is invalid or has been altered.");
  }

  await store.suppress(email, "recipient opted out");
  // Deselect everywhere so the address cannot re-enter a future batch.
  await sql("UPDATE leads SET selected = FALSE WHERE lower(email) = $1", [email]);

  return page("Unsubscribed", `<b>${email}</b> has been removed. You won't hear from us again.`);
}
