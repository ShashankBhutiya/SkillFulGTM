import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { newId, sql } from "@/lib/db";
import { currentUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

/** Starts a template-only campaign without spending AI or sourcing credits. */
export const POST = apiRoute(async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { name } = (await req.json()) as { name?: string };
  const campaignName = name?.trim();
  if (!campaignName) {
    return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
  }
  if (campaignName.length > 120) {
    return NextResponse.json({ error: "Campaign name must be 120 characters or fewer." }, { status: 400 });
  }

  const id = newId("cmp");
  await sql(
    `INSERT INTO campaigns (id, user_id, company_name, company_input, icp, status)
     VALUES ($1, $2, $3, $4, NULL, 'importing')`,
    [id, user.id, campaignName, JSON.stringify({ name: campaignName, mode: "template" })],
  );
  return NextResponse.json({ campaignId: id });
});
