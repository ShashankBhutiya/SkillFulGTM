import { NextResponse } from "next/server";
import { draftEmail } from "@/lib/agents/draft";
import { describeError } from "@/lib/gemini";
import { db, newId, nowIso, store, type LeadRow } from "@/lib/db";
import { CompanyInput, IcpSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 800;

/** How many drafting calls are in flight at once. */
const CONCURRENCY = 4;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Step 3 — write one email per selected lead. */
export async function POST(req: Request) {
  const { campaignId } = (await req.json()) as { campaignId?: string };
  const campaign = campaignId ? store.getCampaign(campaignId) : undefined;
  if (!campaign?.icp) {
    return NextResponse.json({ error: "Campaign or ICP not found" }, { status: 404 });
  }

  const company = CompanyInput.parse(JSON.parse(campaign.company_input));
  const icp = IcpSchema.parse(JSON.parse(campaign.icp));
  const leads = store.listSelectedLeads(campaign.id).filter((l) => l.email);

  if (!leads.length) {
    return NextResponse.json(
      { error: "No selected leads with an email address to draft for." },
      { status: 400 },
    );
  }

  const failures: { lead: string; error: string }[] = [];

  const upsert = db().prepare(
    `INSERT INTO drafts (id, campaign_id, lead_id, subject, body, basis, persona, confidence, approved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(lead_id) DO UPDATE SET
       subject = excluded.subject,
       body = excluded.body,
       basis = excluded.basis,
       persona = excluded.persona,
       confidence = excluded.confidence,
       approved = 0`,
  );

  await mapLimit(leads, CONCURRENCY, async (lead: LeadRow) => {
    try {
      const draft = await draftEmail(company, icp, lead);
      upsert.run(
        newId("drf"),
        campaign.id,
        lead.id,
        draft.subject,
        draft.body,
        draft.personalizationBasis,
        draft.matchedPersona,
        draft.confidence,
        nowIso(),
      );
    } catch (err) {
      failures.push({
        lead: `${lead.first_name} ${lead.last_name}`.trim() || lead.id,
        error: describeError(err),
      });
    }
  });

  db().prepare("UPDATE campaigns SET status = 'drafted' WHERE id = ?").run(campaign.id);

  return NextResponse.json({
    drafts: store.listDrafts(campaign.id),
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

  const draft = store.getDraft(draftId);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  db().prepare(
    "UPDATE drafts SET subject = ?, body = ?, approved = ? WHERE id = ?",
  ).run(
    subject ?? draft.subject,
    body ?? draft.body,
    approved === undefined ? draft.approved : approved ? 1 : 0,
    draftId,
  );

  return NextResponse.json({ ok: true });
}
