import { NextResponse } from "next/server";
import { db, newId, nowIso, store } from "@/lib/db";
import { leadProvider } from "@/lib/providers";
import { IcpSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Step 2 — run the ICP's sourcing plan (Exa → Hunter) and store the matches. */
export async function POST(req: Request) {
  const { campaignId, limit = 25 } = (await req.json()) as {
    campaignId?: string;
    limit?: number;
  };

  const campaign = campaignId ? store.getCampaign(campaignId) : undefined;
  if (!campaign?.icp) {
    return NextResponse.json({ error: "Campaign or ICP not found" }, { status: 404 });
  }

  const icp = IcpSchema.parse(JSON.parse(campaign.icp));
  const capped = Math.max(1, Math.min(Number(limit) || 25, 200));

  try {
    const { leads, totalAvailable, warnings } = await leadProvider().search(icp, capped);

    // A re-run replaces the list rather than appending duplicates.
    db().prepare("DELETE FROM leads WHERE campaign_id = ?").run(campaign.id);
    const insert = db().prepare(
      `INSERT INTO leads (id, campaign_id, external_id, first_name, last_name, title,
                          email, email_status, linkedin_url, company_name, company_domain,
                          company_blurb, raw, selected, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const l of leads) {
      const suppressed = l.email ? store.isSuppressed(l.email) : false;
      insert.run(
        newId("lead"),
        campaign.id,
        l.externalId,
        l.firstName,
        l.lastName,
        l.title,
        l.email,
        l.emailStatus,
        l.linkedinUrl,
        l.companyName,
        l.companyDomain,
        l.companyBlurb,
        JSON.stringify(l.raw),
        // Preselect only leads that can actually be mailed.
        l.email && !suppressed ? 1 : 0,
        nowIso(),
      );
    }

    db().prepare("UPDATE campaigns SET status = 'leads' WHERE id = ?").run(campaign.id);

    return NextResponse.json({
      leads: store.listLeads(campaign.id),
      totalAvailable,
      warnings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

/** Include or exclude a lead from the batch. */
export async function PATCH(req: Request) {
  const { leadId, selected } = (await req.json()) as {
    leadId?: string;
    selected?: boolean;
  };
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  const lead = store.getLead(leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (selected && !lead.email) {
    return NextResponse.json(
      { error: "This lead has no email address and cannot be mailed." },
      { status: 400 },
    );
  }

  db().prepare("UPDATE leads SET selected = ? WHERE id = ?").run(selected ? 1 : 0, leadId);
  return NextResponse.json({ ok: true });
}
