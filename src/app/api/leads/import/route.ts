import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { newId, sql, store, tx } from "@/lib/db";
import { normalizeFieldName } from "@/lib/email/template";
import { currentUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

type ImportRow = Record<string, unknown>;

const aliases: Record<string, string[]> = {
  email: ["email", "email_address", "work_email"],
  first_name: ["first_name", "firstname", "first"],
  last_name: ["last_name", "lastname", "last", "surname"],
  title: ["title", "job_title", "role"],
  company_name: ["company_name", "company", "organization", "organisation"],
  company_domain: ["company_domain", "domain", "website"],
  linkedin_url: ["linkedin_url", "linkedin", "linkedin_profile"],
};

function pick(row: Record<string, string>, field: keyof typeof aliases): string {
  for (const key of aliases[field]) {
    if (row[key]?.trim()) return row[key].trim();
  }
  return "";
}

export const POST = apiRoute(async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { campaignId, rows, mode = "replace", rowOffset = 2 } = (await req.json()) as {
    campaignId?: string;
    rows?: ImportRow[];
    mode?: "append" | "replace";
    rowOffset?: number;
  };
  const campaign = campaignId ? await store.getCampaign(user.id, campaignId) : undefined;
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (mode !== "append" && mode !== "replace") {
    return NextResponse.json({ error: "Import mode must be append or replace." }, { status: 400 });
  }
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: "The CSV contains no recipient rows." }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: "Import at most 1,000 recipients at a time." }, { status: 400 });
  }

  const existingLeads = mode === "append" ? await store.listLeads(user.id, campaign.id) : [];
  const existingEmails = new Set(existingLeads.map(({ email }) => email.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const accepted: { normalized: Record<string, string>; email: string }[] = [];
  const rejected: { row: number; reason: string }[] = [];

  rows.forEach((source, index) => {
    const normalized = Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        normalizeFieldName(key),
        value == null ? "" : String(value).trim(),
      ]),
    );
    const email = pick(normalized, "email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rejected.push({ row: index + rowOffset, reason: "Missing or invalid email address" });
    } else if (seen.has(email)) {
      rejected.push({ row: index + rowOffset, reason: "Duplicate email address in this import" });
    } else if (existingEmails.has(email)) {
      rejected.push({ row: index + rowOffset, reason: "Email address already exists in this campaign" });
    } else {
      seen.add(email);
      accepted.push({ normalized, email });
    }
  });

  if (!accepted.length) {
    return NextResponse.json(
      { error: "No valid recipients were found. Include an email column." },
      { status: 400 },
    );
  }
  if (existingLeads.length + accepted.length > 1000) {
    return NextResponse.json(
      { error: "A campaign can contain at most 1,000 recipients." },
      { status: 400 },
    );
  }

  const suppressed = new Set(
    (
      await sql<{ email: string }>("SELECT email FROM user_suppression WHERE user_id = $1 AND email = ANY($2::text[])", [
        user.id,
        accepted.map(({ email }) => email),
      ])
    ).map(({ email }) => email),
  );

  await tx(async (client) => {
    if (mode === "replace") {
      await client.query("DELETE FROM leads WHERE campaign_id = $1", [campaign.id]);
    }
    for (const { normalized, email } of accepted) {
      await client.query(
        `INSERT INTO leads (id, campaign_id, first_name, last_name, title, email,
                            email_status, linkedin_url, company_name, company_domain,
                            company_blurb, raw, selected)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'',$11,$12)`,
        [
          newId("lead"),
          campaign.id,
          pick(normalized, "first_name"),
          pick(normalized, "last_name"),
          pick(normalized, "title"),
          email,
          "imported",
          pick(normalized, "linkedin_url"),
          pick(normalized, "company_name"),
          pick(normalized, "company_domain"),
          JSON.stringify({ custom_fields: normalized }),
          !suppressed.has(email),
        ],
      );
    }
    await client.query("UPDATE campaigns SET status = 'leads' WHERE id = $1", [campaign.id]);
  });

  return NextResponse.json({
    leads: await store.listLeads(user.id, campaign.id),
    imported: accepted.length,
    suppressed: suppressed.size,
    rejected,
    fields: [...new Set(accepted.flatMap(({ normalized }) => Object.keys(normalized)))].sort(),
  });
});
