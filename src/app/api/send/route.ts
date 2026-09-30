import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import { sql, store, type DraftRow, type LeadRow } from "@/lib/db";
import { env } from "@/lib/env";
import { getMailbox, type MailboxConfig } from "@/lib/mailbox";
import { sendBatch, verifyTransport, type SendOutcome } from "@/lib/email/sender";

export const runtime = "nodejs";
export const maxDuration = 300;

type JobRow = {
  user_id: string;
  campaign_id: string;
  status: "running" | "done" | "failed";
  total: number;
  done: number;
  outcomes: SendOutcome[];
  error: string;
  started_at: string;
  lease_until: string | null;
};

const localWorkers = new Set<string>();
const keyFor = (userId: string, campaignId: string) => `${userId}:${campaignId}`;

async function jobFor(userId: string, campaignId: string) {
  const row = (await sql<JobRow>("SELECT * FROM send_jobs WHERE user_id = $1 AND campaign_id = $2", [userId, campaignId]))[0];
  if (!row) return null;
  return {
    campaignId: row.campaign_id,
    total: row.total,
    done: row.done,
    outcomes: row.outcomes ?? [],
    running: row.status === "running",
    startedAt: row.started_at,
    error: row.error || undefined,
  };
}

async function remainingDrafts(userId: string, campaignId: string) {
  return sql<DraftRow>(
    `SELECT d.* FROM drafts d
     JOIN leads l ON l.id = d.lead_id
     JOIN campaigns c ON c.id = d.campaign_id
     WHERE d.campaign_id = $1 AND c.user_id = $2 AND d.approved AND l.selected AND l.email <> ''
       AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.draft_id = d.id)
     ORDER BY d.seq`,
    [campaignId, userId],
  );
}

function launchWorker(userId: string, campaignId: string, mailbox: MailboxConfig): void {
  const workerKey = keyFor(userId, campaignId);
  if (localWorkers.has(workerKey)) return;
  localWorkers.add(workerKey);
  const leaseSeconds = Math.max(180, mailbox.seconds_between + 120);

  void (async () => {
    const claimed = await sql(
      `UPDATE send_jobs SET lease_until = now() + ($3 * interval '1 second'), updated_at = now()
       WHERE user_id = $1 AND campaign_id = $2 AND status = 'running'
         AND (lease_until IS NULL OR lease_until < now()) RETURNING 1`,
      [userId, campaignId, leaseSeconds],
    );
    if (!claimed.length) return;

    const drafts = await remainingDrafts(userId, campaignId);
    await sql(
      `UPDATE send_jobs SET done = GREATEST(done, total - $3), updated_at = now()
       WHERE user_id = $1 AND campaign_id = $2`,
      [userId, campaignId, drafts.length],
    );
    const items = (
      await Promise.all(drafts.map(async (draft) => {
        const lead = await store.getLead(userId, draft.lead_id);
        return lead ? { draft, lead } : null;
      }))
    ).filter((item): item is { draft: DraftRow; lead: LeadRow } => item !== null);

    await sendBatch(userId, mailbox, campaignId, items, async (outcome) => {
      await sql(
        `UPDATE send_jobs SET done = LEAST(total, done + 1),
          outcomes = outcomes || $3::jsonb, lease_until = now() + ($4 * interval '1 second'),
          updated_at = now() WHERE user_id = $1 AND campaign_id = $2`,
        [userId, campaignId, JSON.stringify([outcome]), leaseSeconds],
      );
    });
    await sql(
      `UPDATE send_jobs SET status = 'done', done = total, lease_until = NULL, updated_at = now()
       WHERE user_id = $1 AND campaign_id = $2`,
      [userId, campaignId],
    );
    await sql("UPDATE campaigns SET status = 'done' WHERE id = $1 AND user_id = $2", [campaignId, userId]);
  })().catch(async (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    await sql(
      `UPDATE send_jobs SET status = 'failed', error = $3, lease_until = NULL, updated_at = now()
       WHERE user_id = $1 AND campaign_id = $2`,
      [userId, campaignId, detail.slice(0, 2000)],
    ).catch(() => {});
  }).finally(() => localWorkers.delete(workerKey));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!user.email_verified) return NextResponse.json({ error: "Verify your account email before sending." }, { status: 403 });
  if (env.baseUrlIsLocal) {
    return NextResponse.json({ error: `APP_BASE_URL is "${env.baseUrl}", so recipients cannot reach unsubscribe links. Set a public URL before sending.` }, { status: 400 });
  }
  const { campaignId } = (await req.json()) as { campaignId?: string };
  const campaign = campaignId ? await store.getCampaign(user.id, campaignId) : undefined;
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const active = (await sql<JobRow>(
    "SELECT * FROM send_jobs WHERE user_id = $1 AND campaign_id = $2 AND status = 'running' AND lease_until > now()",
    [user.id, campaign.id],
  ))[0];
  if (active) return NextResponse.json({ error: "A send is already running for this campaign." }, { status: 409 });

  const drafts = await remainingDrafts(user.id, campaign.id);
  if (!drafts.length) return NextResponse.json({ error: "Nothing to send — approve at least one unsent draft first." }, { status: 400 });
  const mailbox = await getMailbox(user.id);
  if (!mailbox) return NextResponse.json({ error: "Connect your sending mailbox in Account settings first." }, { status: 400 });
  const check = await verifyTransport(mailbox);
  if (!check.ok) return NextResponse.json({ error: `SMTP connection failed: ${check.error}` }, { status: 502 });

  await sql(
    `INSERT INTO send_jobs (user_id, campaign_id, status, total, done, outcomes, error, started_at, updated_at, lease_until)
     VALUES ($1,$2,'running',$3,0,'[]'::jsonb,'',now(),now(),NULL)
     ON CONFLICT (user_id, campaign_id) DO UPDATE SET status='running', total=excluded.total,
       done=0, outcomes='[]'::jsonb, error='', started_at=now(), updated_at=now(), lease_until=NULL`,
    [user.id, campaign.id, drafts.length],
  );
  await sql("UPDATE campaigns SET status = 'sending' WHERE id = $1 AND user_id = $2", [campaign.id, user.id]);
  launchWorker(user.id, campaign.id, mailbox);
  return NextResponse.json({ started: true, total: drafts.length, pacing: `${mailbox.seconds_between}s between messages, max ${mailbox.max_sends_per_day}/day` });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  if (!(await store.getCampaign(user.id, campaignId))) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const mailbox = await getMailbox(user.id);
  if (mailbox) launchWorker(user.id, campaignId, mailbox);
  return NextResponse.json({ job: await jobFor(user.id, campaignId), sentToday: await store.sendsInLastDay(user.id), dailyCap: mailbox?.max_sends_per_day ?? 0 });
}
