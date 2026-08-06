import { NextResponse } from "next/server";
import { db, store, type DraftRow, type LeadRow } from "@/lib/db";
import { env } from "@/lib/env";
import { sendBatch, verifyTransport, type SendOutcome } from "@/lib/email/sender";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sending is paced by design, so a batch outlives an HTTP request. The job runs
 * in the background and the client polls GET for progress.
 */
type Job = {
  campaignId: string;
  total: number;
  done: number;
  outcomes: SendOutcome[];
  running: boolean;
  startedAt: string;
  error?: string;
};

const globalRef = globalThis as unknown as { __sendJobs?: Map<string, Job> };
const jobs = globalRef.__sendJobs ?? (globalRef.__sendJobs = new Map<string, Job>());

export async function POST(req: Request) {
  // Checked before anything else: this is a configuration fault, and shipping
  // mail whose unsubscribe link nobody can open is worse than not sending.
  if (env.baseUrlIsLocal) {
    return NextResponse.json(
      {
        error:
          `APP_BASE_URL is "${env.baseUrl}", which recipients cannot reach — every ` +
          `unsubscribe link would be dead, and a working opt-out is legally required. ` +
          `Set APP_BASE_URL to a public URL (deploy, or tunnel with ngrok) and restart.`,
      },
      { status: 400 },
    );
  }

  const { campaignId } = (await req.json()) as { campaignId?: string };
  const campaign = campaignId ? store.getCampaign(campaignId) : undefined;
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const existing = jobs.get(campaign.id);
  if (existing?.running) {
    return NextResponse.json({ error: "A send is already running for this campaign." }, { status: 409 });
  }

  // Only drafts a human explicitly approved are eligible.
  const rows = db()
    .prepare(
      `SELECT d.*, l.id AS l_id FROM drafts d
       JOIN leads l ON l.id = d.lead_id
       WHERE d.campaign_id = ? AND d.approved = 1 AND l.selected = 1 AND l.email <> ''
       ORDER BY d.rowid`,
    )
    .all(campaign.id) as unknown as (DraftRow & { l_id: string })[];

  if (!rows.length) {
    return NextResponse.json(
      { error: "Nothing to send — approve at least one draft first." },
      { status: 400 },
    );
  }

  const check = await verifyTransport();
  if (!check.ok) {
    return NextResponse.json(
      { error: `SMTP connection failed: ${check.error}` },
      { status: 502 },
    );
  }

  const items = rows
    .map((d) => {
      const lead = store.getLead(d.lead_id);
      return lead ? { draft: d as DraftRow, lead: lead as LeadRow } : null;
    })
    .filter((x): x is { draft: DraftRow; lead: LeadRow } => x !== null);

  const job: Job = {
    campaignId: campaign.id,
    total: items.length,
    done: 0,
    outcomes: [],
    running: true,
    startedAt: new Date().toISOString(),
  };
  jobs.set(campaign.id, job);
  db().prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(campaign.id);

  void sendBatch(campaign.id, items, (outcome) => {
    job.outcomes.push(outcome);
    job.done += 1;
  })
    .catch((err: unknown) => {
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      job.running = false;
      db().prepare("UPDATE campaigns SET status = 'done' WHERE id = ?").run(campaign.id);
    });

  return NextResponse.json({
    started: true,
    total: items.length,
    pacing: `${env.secondsBetweenSends}s between messages, max ${env.maxSendsPerDay}/day`,
  });
}

export async function GET(req: Request) {
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const job = jobs.get(campaignId);
  return NextResponse.json({
    job: job ?? null,
    sentToday: store.sendsInLastDay(),
    dailyCap: env.maxSendsPerDay,
  });
}
