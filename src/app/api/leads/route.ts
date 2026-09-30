import { NextResponse } from "next/server";
import { newId, sql, store, tx } from "@/lib/db";
import { leadProvider } from "@/lib/providers";
import { IcpSchema } from "@/lib/schemas";
import { currentUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Step 2 — run the ICP's sourcing plan (Exa → Hunter) and store the matches. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { campaignId, limit = 25 } = (await req.json()) as {
    campaignId?: string;
    limit?: number;
  };

  const campaign = campaignId ? await store.getCampaign(user.id, campaignId) : undefined;
  if (!campaign?.icp) {
    return NextResponse.json({ error: "Campaign or ICP not found" }, { status: 404 });
  }

  const icp = IcpSchema.parse(JSON.parse(campaign.icp));
  const capped = Math.max(1, Math.min(Number(limit) || 25, 200));

  try {
    const { leads, totalAvailable, warnings } = await leadProvider().search(icp, capped);

    // Suppression is checked up front so the whole write is one transaction.
    const suppressed = new Set(
      (
        await sql<{ email: string }>(
          "SELECT email FROM user_suppression WHERE user_id = $1 AND email = ANY($2::text[])",
          [user.id, leads.map((l) => l.email.toLowerCase()).filter(Boolean)],
        )
      ).map((r) => r.email),
    );

    await tx(async (c) => {
      // A re-run replaces the list rather than appending duplicates.
      await c.query("DELETE FROM leads WHERE campaign_id = $1", [campaign.id]);
      for (const l of leads) {
        await c.query(
          `INSERT INTO leads (id, campaign_id, external_id, first_name, last_name, title,
                              email, email_status, linkedin_url, company_name, company_domain,
                              company_blurb, raw, selected)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
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
            Boolean(l.email) && !suppressed.has(l.email.toLowerCase()),
          ],
        );
      }
      await c.query("UPDATE campaigns SET status = 'leads' WHERE id = $1", [campaign.id]);
    });

    return NextResponse.json({
      leads: await store.listLeads(user.id, campaign.id),
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
  const user = await currentUser();
  if (!user) return unauthorized();
  const { leadId, selected } = (await req.json()) as {
    leadId?: string;
    selected?: boolean;
  };
  if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });

  const lead = await store.getLead(user.id, leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (selected && !lead.email) {
    return NextResponse.json(
      { error: "This lead has no email address and cannot be mailed." },
      { status: 400 },
    );
  }

  await sql(
    `UPDATE leads SET selected = $1 WHERE id = $2
     AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = $3)`,
    [Boolean(selected), leadId, user.id],
  );
  return NextResponse.json({ ok: true });
}
