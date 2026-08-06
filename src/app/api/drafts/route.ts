import { NextResponse } from "next/server";
import { draftEmail } from "@/lib/agents/draft";
import { describeError } from "@/lib/gemini";
import { newId, sql, store, type LeadRow } from "@/lib/db";
import { CompanyInput, IcpSchema } from "@/lib/schemas";

export const runtime = "nodejs";
// 300s is the ceiling on Vercel's Hobby plan. Drafting fans out CONCURRENCY
// calls at a time, so a large batch can outrun this — see the cap below.
export const maxDuration = 300;

/** How many drafting calls are in flight at once. */
const CONCURRENCY = 4;

/**
 * Stop starting new work with this much of the budget left. Rate-limit retries
 * back off up to ~20s, so a draft started near the limit can overrun it — and
 * being killed by the platform loses the response, not just the draft.
 */
const DEADLINE_MS = (maxDuration - 45) * 1000;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  deadline?: number,
): Promise<{ processed: number; remaining: T[] }> {
  let cursor = 0;
  let processed = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (deadline && Date.now() > deadline) return;
      const i = cursor++;
      await fn(items[i]!);
      processed += 1;
    }
  });
  await Promise.all(workers);
  // Anything the workers never claimed, plus anything abandoned at the deadline.
  return { processed, remaining: items.slice(Math.min(cursor, items.length)) };
}

/** Step 3 — write one email per selected lead. */
export async function POST(req: Request) {
  const { campaignId, redraft } = (await req.json()) as {
    campaignId?: string;
    /** Rewrite leads that already have a draft. Off by default so a second
     *  press resumes an interrupted run instead of paying for it twice. */
    redraft?: boolean;
  };
  const campaign = campaignId ? await store.getCampaign(campaignId) : undefined;
  if (!campaign?.icp) {
    return NextResponse.json({ error: "Campaign or ICP not found" }, { status: 404 });
  }

  const company = CompanyInput.parse(JSON.parse(campaign.company_input));
  const icp = IcpSchema.parse(JSON.parse(campaign.icp));
  const selected = (await store.listSelectedLeads(campaign.id)).filter((l) => l.email);

  if (!selected.length) {
    return NextResponse.json(
      { error: "No selected leads with an email address to draft for." },
      { status: 400 },
    );
  }

  const alreadyDrafted = new Set(
    (await store.listDrafts(campaign.id)).map((d) => d.lead_id),
  );
  const leads = redraft ? selected : selected.filter((l) => !alreadyDrafted.has(l.id));

  // Every selected lead already has a draft and no rewrite was asked for.
  if (!leads.length) {
    return NextResponse.json({
      drafts: await store.listDrafts(campaign.id),
      failures: [],
    });
  }

  const failures: { lead: string; error: string }[] = [];

  const UPSERT = `
    INSERT INTO drafts (id, campaign_id, lead_id, subject, body, basis, persona, confidence, approved)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
    ON CONFLICT (lead_id) DO UPDATE SET
      subject = excluded.subject,
      body = excluded.body,
      basis = excluded.basis,
      persona = excluded.persona,
      confidence = excluded.confidence,
      approved = FALSE`;

  const deadline = Date.now() + DEADLINE_MS;

  const { remaining } = await mapLimit(leads, CONCURRENCY, async (lead: LeadRow) => {
    try {
      const draft = await draftEmail(company, icp, lead);
      await sql(UPSERT, [
        newId("drf"),
        campaign.id,
        lead.id,
        draft.subject,
        draft.body,
        draft.personalizationBasis,
        draft.matchedPersona,
        draft.confidence,
      ]);
    } catch (err) {
      failures.push({
        lead: `${lead.first_name} ${lead.last_name}`.trim() || lead.id,
        error: describeError(err),
      });
    }
  }, deadline);

  // Drafts are upserted per lead, so anything finished is already saved. Say
  // plainly what was left rather than returning a silently short list.
  if (remaining.length) {
    failures.push({
      lead: `${remaining.length} lead${remaining.length === 1 ? "" : "s"}`,
      error:
        "Ran out of time before drafting these. Everything already written is saved — press “Write emails” again to continue where it stopped.",
    });
  }

  await sql("UPDATE campaigns SET status = 'drafted' WHERE id = $1", [campaign.id]);

  return NextResponse.json({
    drafts: await store.listDrafts(campaign.id),
    failures,
  });
}

/** Edit or approve a single draft. Every field here is meant to be overridden. */
export async function PATCH(req: Request) {
  const { draftId, subject, body, approved } = (await req.json()) as {
    draftId?: string;
    subject?: string;
    body?: string;
    approved?: boolean;
  };
  if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });

  const draft = await store.getDraft(draftId);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  await sql("UPDATE drafts SET subject = $1, body = $2, approved = $3 WHERE id = $4", [
    subject ?? draft.subject,
    body ?? draft.body,
    approved === undefined ? draft.approved : Boolean(approved),
    draftId,
  ]);

  return NextResponse.json({ ok: true });
}
