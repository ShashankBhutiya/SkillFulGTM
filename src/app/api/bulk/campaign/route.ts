import { NextResponse } from "next/server";
import { newId, sql } from "@/lib/db";

export const runtime = "nodejs";

/** Starts a template-only campaign without spending AI or sourcing credits. */
export async function POST(req: Request) {
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
    `INSERT INTO campaigns (id, company_name, company_input, icp, status)
     VALUES ($1, $2, $3, NULL, 'importing')`,
    [id, campaignName, JSON.stringify({ name: campaignName, mode: "template" })],
  );
  return NextResponse.json({ campaignId: id });
}
