import { unsubscribeUrl } from "./unsubscribe";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ComposeArgs = {
  firstName: string;
  body: string;
  recipientEmail: string;
  userId: string;
  fromName: string;
  postalAddress: string;
};

/**
 * Wraps the model's body in the parts that must be identical on every message:
 * the greeting, the sender's real identity, the physical postal address, and a
 * working opt-out. The model never writes these — they are not creative fields.
 */
export function compose({ firstName, body, recipientEmail, userId, fromName, postalAddress }: ComposeArgs) {
  const unsub = unsubscribeUrl(userId, recipientEmail);
  const greeting = firstName.trim() ? `Hi ${firstName.trim()},` : "Hi,";
  const clean = body.trim();

  const text = [
    greeting,
    "",
    clean,
    "",
    fromName,
    "",
    "—",
    postalAddress,
    `Don't want these? Unsubscribe: ${unsub}`,
  ].join("\n");

  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">
<p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
${paragraphs}
<p style="margin:0 0 14px">${escapeHtml(fromName)}</p>
<hr style="border:none;border-top:1px solid #e4e4e7;margin:22px 0 10px">
<p style="margin:0;font-size:12px;color:#71717a">
${escapeHtml(postalAddress)}<br>
<a href="${unsub}" style="color:#71717a">Unsubscribe</a>
</p>
</div>`;

  return { text, html, unsubscribeUrl: unsub };
}
