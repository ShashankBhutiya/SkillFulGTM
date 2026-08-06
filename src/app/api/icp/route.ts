import { NextResponse } from "next/server";
import { generateIcp } from "@/lib/agents/icp";
import { describeError } from "@/lib/gemini";
import { db, newId, nowIso, store } from "@/lib/db";
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
    db().prepare(
      `INSERT INTO campaigns (id, company_name, company_input, icp, status, created_at)
       VALUES (?, ?, ?, ?, 'leads', ?)`,
    ).run(id, input.name, JSON.stringify(input), JSON.stringify(icp), nowIso());

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
  if (!store.getCampaign(campaignId)) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  db().prepare("UPDATE campaigns SET icp = ? WHERE id = ?").run(
    JSON.stringify(icp),
    campaignId,
  );
  return NextResponse.json({ ok: true });
}
