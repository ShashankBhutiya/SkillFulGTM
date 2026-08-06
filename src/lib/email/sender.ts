import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { db, newId, nowIso, store, type DraftRow, type LeadRow } from "../db";
import { compose } from "./compose";
import { verifyEmail } from "../providers/hunter";

let transporter: Transporter | null = null;

function transport(): Transporter {
  if (transporter) return transporter;
  const s = env.smtp;
  transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
  });
  return transporter;
}

/** Confirms the SMTP credentials work before a batch is started. */
export async function verifyTransport(): Promise<{ ok: boolean; error?: string }> {
  try {
    await transport().verify();
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

function record(
  campaignId: string,
  draftId: string,
  email: string,
  status: SendOutcome["status"],
  detail: string,
  messageId = "",
): void {
  db().prepare(
    `INSERT INTO sends (id, campaign_id, draft_id, email, status, detail, message_id, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId("snd"), campaignId, draftId, email.toLowerCase(), status, detail, messageId, nowIso());
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
    store.suppress(email, `bad address: ${verdict.detail}`);
  }
  record(campaignId, draftId, email, "skipped", verdict.detail);
  return { ok: false, detail: verdict.detail };
}

export async function sendBatch(
  campaignId: string,
  items: { draft: DraftRow; lead: LeadRow }[],
  onProgress?: (outcome: SendOutcome, index: number) => void,
): Promise<SendOutcome[]> {
  const outcomes: SendOutcome[] = [];
  const s = env.smtp;
  const from = s.fromName ? `"${s.fromName}" <${s.from}>` : s.from;

  let budget = env.maxSendsPerDay - store.sendsInLastDay();

  for (const [i, { draft, lead } ] of items.entries()) {
    const email = lead.email.trim().toLowerCase();
    let outcome: SendOutcome;
    let verdict: Awaited<ReturnType<typeof checkDeliverable>>;

    if (!email) {
      outcome = { email: "", status: "skipped", detail: "No email address on this lead." };
      record(campaignId, draft.id, "", "skipped", outcome.detail);
    } else if (store.isSuppressed(email)) {
      outcome = { email, status: "skipped", detail: "Address is on the suppression list." };
      record(campaignId, draft.id, email, "skipped", outcome.detail);
    } else if (store.alreadySent(campaignId, email)) {
      outcome = { email, status: "skipped", detail: "Already mailed in this campaign." };
      record(campaignId, draft.id, email, "skipped", outcome.detail);
    } else if (budget <= 0) {
      outcome = {
        email,
        status: "skipped",
        detail: `Daily cap of ${env.maxSendsPerDay} reached. Resume tomorrow or raise MAX_SENDS_PER_DAY.`,
      };
      record(campaignId, draft.id, email, "skipped", outcome.detail);
    } else if (!(verdict = await checkDeliverable(email, campaignId, draft.id)).ok) {
      outcome = { email, status: "skipped", detail: verdict.detail };
    } else {
      const { text, html, unsubscribeUrl } = compose({
        firstName: lead.first_name,
        body: draft.body,
        recipientEmail: email,
      });

      try {
        const info = await transport().sendMail({
          from,
          to: email,
          replyTo: s.replyTo || undefined,
          subject: draft.subject,
          text,
          html,
          headers: {
            // Puts a native "Unsubscribe" control in Gmail and Outlook, which
            // is what recipients click instead of "report spam".
            "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${s.from}?subject=unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        budget -= 1;
        outcome = { email, status: "sent", detail: "" };
        record(campaignId, draft.id, email, "sent", "", info.messageId ?? "");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        outcome = { email, status: "failed", detail };
        record(campaignId, draft.id, email, "failed", detail);
      }
    }

    outcomes.push(outcome);
    onProgress?.(outcome, i);

    // Only pace after an actual delivery; skips cost nothing.
    if (outcome.status === "sent" && i < items.length - 1) {
      await sleep(env.secondsBetweenSends * 1000);
    }
  }

  return outcomes;
}
