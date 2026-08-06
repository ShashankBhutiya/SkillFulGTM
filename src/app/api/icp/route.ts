import { NextResponse } from "next/server";
import { generateIcp } from "@/lib/agents/icp";
import { describeError } from "@/lib/gemini";
import { newId, sql, store } from "@/lib/db";
import { CompanyInput } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Step 1 — turn a company description into an ICP and open a campaign. */
export async function POST(req: Request) {
  const parsed = CompanyInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  }
  const input: CompanyInput = parsed.data;

  try {
    const icp = await generateIcp(input);
    const id = newId("cmp");
    await sql(
      `INSERT INTO campaigns (id, company_name, company_input, icp, status)
       VALUES ($1, $2, $3, $4, 'leads')`,
      [id, input.name, JSON.stringify(input), JSON.stringify(icp)],
    );

    return NextResponse.json({ campaignId: id, icp });
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}

/** Saves a hand-edited ICP back onto the campaign. */
export async function PATCH(req: Request) {
  const { campaignId, icp } = (await req.json()) as { campaignId?: string; icp?: unknown };
  if (!campaignId || !icp) {
    return NextResponse.json({ error: "campaignId and icp are required" }, { status: 400 });
  }
  if (!(await store.getCampaign(campaignId))) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  await sql("UPDATE campaigns SET icp = $1 WHERE id = $2", [
    JSON.stringify(icp),
    campaignId,
  ]);
  return NextResponse.json({ ok: true });
}
