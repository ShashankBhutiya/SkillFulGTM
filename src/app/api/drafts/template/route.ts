import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { newId, store, tx } from "@/lib/db";
import { fieldsForLead, renderTemplate } from "@/lib/email/template";
import { currentUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export const POST = apiRoute(async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { campaignId, subject, body, templateName, previewOnly = false } = (await req.json()) as {
    campaignId?: string;
    subject?: string;
    body?: string;
    templateName?: string;
    previewOnly?: boolean;
  };
  const campaign = campaignId ? await store.getCampaign(user.id, campaignId) : undefined;
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Template subject and body are required." }, { status: 400 });
  }

  const leads = await store.listSelectedLeads(user.id, campaign.id);
  if (!leads.length) {
    return NextResponse.json({ error: "Select at least one recipient first." }, { status: 400 });
  }

  const previews = leads.map((lead) => {
    const fields = fieldsForLead(lead);
    const renderedSubject = renderTemplate(subject, fields);
    const renderedBody = renderTemplate(body, fields);
    return {
      leadId: lead.id,
      email: lead.email,
      name: fields.full_name,
      subject: renderedSubject.value,
      body: renderedBody.value,
      missing: [...new Set([...renderedSubject.missing, ...renderedBody.missing])],
    };
  });

  if (!previewOnly) {
    await tx(async (client) => {
      for (const preview of previews) {
        await client.query(
          `INSERT INTO drafts (id, campaign_id, lead_id, subject, body, basis, persona, confidence, approved)
           VALUES ($1,$2,$3,$4,$5,$6,'template','template',FALSE)
           ON CONFLICT (lead_id) DO UPDATE SET
             subject=excluded.subject, body=excluded.body, basis=excluded.basis,
             persona='template', confidence='template', approved=FALSE`,
          [
            newId("drf"),
            campaign.id,
            preview.leadId,
            preview.subject,
            preview.body,
            `Template: ${templateName?.trim() || "Untitled"}`,
          ],
        );
      }
      await client.query("UPDATE campaigns SET status = 'drafted' WHERE id = $1", [campaign.id]);
    });
  }

  return NextResponse.json({ previews, drafts: previewOnly ? undefined : await store.listDrafts(user.id, campaign.id) });
});
