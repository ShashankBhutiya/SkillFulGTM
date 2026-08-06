import { NextResponse } from "next/server";
import { store } from "@/lib/db";

export const runtime = "nodejs";

/** Full campaign state — the client rehydrates from this on load and after edits. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const [leads, drafts] = await Promise.all([store.listLeads(id), store.listDrafts(id)]);

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      companyName: campaign.company_name,
      status: campaign.status,
      createdAt: campaign.created_at,
    },
    companyInput: JSON.parse(campaign.company_input),
    icp: campaign.icp ? JSON.parse(campaign.icp) : null,
    leads,
    drafts,
  });
}
