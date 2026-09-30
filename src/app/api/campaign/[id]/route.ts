import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { store } from "@/lib/db";
import { currentUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

/** Full campaign state — the client rehydrates from this on load and after edits. */
export const GET = apiRoute(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const campaign = await store.getCampaign(user.id, id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const [leads, drafts] = await Promise.all([store.listLeads(user.id, id), store.listDrafts(user.id, id)]);

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
});
