import nodemailer, { type Transporter } from "nodemailer";
import { newId, sql, store, type DraftRow, type LeadRow } from "../db";
import type { MailboxConfig } from "../mailbox";
import { compose } from "./compose";
import { verifyEmail } from "../providers/hunter";
import { env } from "../env";

function transport(s: MailboxConfig): Transporter {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.auth_type === "google"
      ? { type: "OAuth2", user: s.username, refreshToken: s.password, clientId: env.googleOAuth.clientId, clientSecret: env.googleOAuth.clientSecret }
      : { user: s.username, pass: s.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    requireTLS: !s.secure,
  });
}

/** Confirms the SMTP credentials work before a batch is started. */
export async function verifyTransport(mailbox: MailboxConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await transport(mailbox).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type SendOutcome = {
  email: string;
  status: "sent" | "failed" | "skipped";
  detail: string;
};

async function record(
  userId: string,
  campaignId: string,
  draftId: string,
  email: string,
  status: SendOutcome["status"],
  detail: string,
  messageId = "",
): Promise<void> {
  await sql(
    `INSERT INTO sends (id, user_id, campaign_id, draft_id, email, status, detail, message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId("snd"), userId, campaignId, draftId, email.toLowerCase(), status, detail, messageId],
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one approved batch, serially and paced.
 *
 * The pacing is not politeness — a cold-start domain that emits a hundred
 * messages in a burst gets classified as a spam source, and mailbox-provider
 * reputation is slow to earn back.
 */
/**
 * Last gate before an address is mailed. A confirmed-bad mailbox is added to
 * the suppression list so it can never be attempted again from any campaign —
 * a hard bounce is permanent damage, and the same bad row will otherwise come
 * back from the next sourcing run.
 */
async function checkDeliverable(
  userId: string,
  email: string,
  campaignId: string,
  draftId: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const verdict = await verifyEmail(email);
  if (verdict.deliverable) return { ok: true };

  // Only permanently suppress a mailbox the provider positively says is dead.
  // An unverifiable address (accept-all domain) may well be real, so it is
  // skipped for this run but left eligible if the operator opts in later.
  if (!verdict.unknown) {
    await store.suppress(userId, email, `bad address: ${verdict.detail}`);
  }
  await record(userId, campaignId, draftId, email, "skipped", verdict.detail);
  return { ok: false, detail: verdict.detail };
}

export async function sendBatch(
  userId: string,
  mailbox: MailboxConfig,
  campaignId: string,
  items: { draft: DraftRow; lead: LeadRow }[],
  onProgress?: (outcome: SendOutcome, index: number) => void | Promise<void>,
): Promise<SendOutcome[]> {
  const outcomes: SendOutcome[] = [];
  const s = mailbox;
  const from = { name: s.from_name, address: s.from_email };

  let budget = s.max_sends_per_day - (await store.sendsInLastDay(userId));

  for (const [i, { draft, lead } ] of items.entries()) {
    const email = lead.email.trim().toLowerCase();
    let outcome: SendOutcome;
    let verdict: Awaited<ReturnType<typeof checkDeliverable>>;

    if (!email) {
      outcome = { email: "", status: "skipped", detail: "No email address on this lead." };
      await record(userId, campaignId, draft.id, "", "skipped", outcome.detail);
    } else if (await store.isSuppressed(userId, email)) {
      outcome = { email, status: "skipped", detail: "Address is on the suppression list." };
      await record(userId, campaignId, draft.id, email, "skipped", outcome.detail);
    } else if (await store.alreadySent(campaignId, email)) {
      outcome = { email, status: "skipped", detail: "Already mailed in this campaign." };
      await record(userId, campaignId, draft.id, email, "skipped", outcome.detail);
    } else if (budget <= 0) {
      outcome = {
        email,
        status: "skipped",
        detail: `Daily cap of ${s.max_sends_per_day} reached. Resume tomorrow or raise it in Mailbox settings.`,
      };
      await record(userId, campaignId, draft.id, email, "skipped", outcome.detail);
    } else if (!(verdict = await checkDeliverable(userId, email, campaignId, draft.id)).ok) {
      outcome = { email, status: "skipped", detail: verdict.detail };
    } else {
      const { text, html, unsubscribeUrl } = compose({
        firstName: lead.first_name,
        body: draft.body,
        recipientEmail: email,
        userId,
        fromName: s.from_name,
        postalAddress: s.postal_address,
      });

      try {
        const lastSentAt = await store.lastSendAt(userId);
        if (lastSentAt) {
          const elapsed = Date.now() - new Date(lastSentAt).getTime();
          const remaining = s.seconds_between * 1000 - elapsed;
          if (remaining > 0) await sleep(remaining);
        }
        const info = await transport(s).sendMail({
          from,
          to: email,
          replyTo: s.reply_to || undefined,
          subject: draft.subject,
          text,
          html,
          headers: {
            // Puts a native "Unsubscribe" control in Gmail and Outlook, which
            // is what recipients click instead of "report spam".
            "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${s.from_email}?subject=unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        budget -= 1;
        outcome = { email, status: "sent", detail: "" };
        await record(userId, campaignId, draft.id, email, "sent", "", info.messageId ?? "");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        outcome = { email, status: "failed", detail };
        await record(userId, campaignId, draft.id, email, "failed", detail);
      }
    }

    outcomes.push(outcome);
    await onProgress?.(outcome, i);

    // Only pace after an actual delivery; skips cost nothing.
    if (outcome.status === "sent" && i < items.length - 1) {
      await sleep(s.seconds_between * 1000);
    }
  }

  return outcomes;
}

/** Sends a single test email directly to the operator's inbox for verification. */
export async function sendTestEmail({
  userId,
  mailbox,
  to,
  subject = "SkillfulGTM — Test Email Verification",
  body = "This is a test email sent from SkillfulGTM to verify your SMTP delivery setup.",
  firstName = "Test Recipient",
}: {
  userId: string;
  mailbox: MailboxConfig;
  to: string;
  subject?: string;
  body?: string;
  firstName?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const s = mailbox;
  const from = { name: s.from_name, address: s.from_email };

  const { text, html, unsubscribeUrl } = compose({
    firstName,
    body: `${body}\n\n---\nNote: This is a test email copy sent from SkillfulGTM.`,
    recipientEmail: to,
    userId,
    fromName: s.from_name,
    postalAddress: s.postal_address,
  });

  try {
    const info = await transport(s).sendMail({
      from,
      to,
      replyTo: s.reply_to || undefined,
      subject: `[TEST] ${subject}`,
      text,
      html: `
        <div style="background:#5b3ce0;color:#ffffff;padding:12px 18px;border-radius:8px;margin-bottom:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;">
          🧪 <strong>TEST EMAIL COPY</strong> — Sent to <code>${to}</code> to verify SMTP delivery and preview layout.
        </div>
        ${html}
      `,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: detail };
  }
}

