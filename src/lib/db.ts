import { Pool, type PoolClient } from "pg";
import { env } from "./env";

/**
 * Storage is Postgres. It replaced a local SQLite file when this moved to
 * serverless hosting: those filesystems are read-only and ephemeral, so the
 * suppression list — the one table that must never be lost, because a reset
 * makes previously-bounced addresses mailable again — could not live there.
 *
 * Nothing above this file imports `pg` directly.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  company_name  TEXT NOT NULL,
  company_input TEXT NOT NULL,
  icp           TEXT,
  status        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq           BIGSERIAL
);

CREATE TABLE IF NOT EXISTS leads (
  id             TEXT PRIMARY KEY,
  campaign_id    TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  external_id    TEXT,
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  title          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  email_status   TEXT NOT NULL DEFAULT '',
  linkedin_url   TEXT NOT NULL DEFAULT '',
  company_name   TEXT NOT NULL DEFAULT '',
  company_domain TEXT NOT NULL DEFAULT '',
  company_blurb  TEXT NOT NULL DEFAULT '',
  raw            TEXT NOT NULL DEFAULT '{}',
  selected       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq            BIGSERIAL
);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);

CREATE TABLE IF NOT EXISTS drafts (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id     TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  basis       TEXT NOT NULL DEFAULT '',
  persona     TEXT NOT NULL DEFAULT '',
  confidence  TEXT NOT NULL DEFAULT '',
  approved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq         BIGSERIAL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_lead ON drafts(lead_id);

CREATE TABLE IF NOT EXISTS sends (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  draft_id    TEXT NOT NULL,
  email       TEXT NOT NULL,
  status      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  message_id  TEXT NOT NULL DEFAULT '',
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sends_at ON sends(sent_at);

CREATE TABLE IF NOT EXISTS suppression (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * Pool and init promise are cached on globalThis: Next.js re-evaluates modules
 * on every edit in dev, which would otherwise leak a pool per reload, and each
 * serverless instance should reuse one pool across invocations.
 */
const globalRef = globalThis as unknown as {
  __skillfulPool?: Pool;
  __skillfulReady?: Promise<void>;
};

function pool(): Pool {
  if (globalRef.__skillfulPool) return globalRef.__skillfulPool;

  const connectionString = env.databaseUrl;
  globalRef.__skillfulPool = new Pool({
    connectionString,
    // Serverless runs many short-lived instances; a large pool per instance
    // exhausts the server's connection limit. Use a pooled/pgbouncer URL too.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Hosted Postgres (Neon, Supabase, Vercel) requires TLS but presents certs
    // that fail default verification from serverless runtimes.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: false },
  });
  return globalRef.__skillfulPool;
}

/** Applies the schema once per process. Idempotent, so concurrent boots are safe. */
function ready(): Promise<void> {
  return (globalRef.__skillfulReady ??= pool()
    .query(SCHEMA)
    .then(() => undefined)
    .catch((err: unknown) => {
      // Let the next call retry rather than caching a permanent failure.
      globalRef.__skillfulReady = undefined;
      throw err;
    }));
}

/** Runs a parameterised query, ensuring the schema exists first. */
export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ready();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

/** Runs several statements in one transaction. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

export type CampaignRow = {
  id: string;
  company_name: string;
  company_input: string;
  icp: string | null;
  status: string;
  created_at: string;
};

export type LeadRow = {
  id: string;
  campaign_id: string;
  external_id: string | null;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  email_status: string;
  linkedin_url: string;
  company_name: string;
  company_domain: string;
  company_blurb: string;
  raw: string;
  /** Postgres BOOLEAN. Was 0/1 under SQLite — compare truthily, not to 1. */
  selected: boolean;
  created_at: string;
};

export type DraftRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  subject: string;
  body: string;
  basis: string;
  persona: string;
  confidence: string;
  approved: boolean;
  created_at: string;
};

export type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const store = {
  async getCampaign(id: string): Promise<CampaignRow | undefined> {
    const rows = await sql<CampaignRow>("SELECT * FROM campaigns WHERE id = $1", [id]);
    return rows[0];
  },

  async listCampaigns(): Promise<CampaignRow[]> {
    return sql<CampaignRow>("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50");
  },

  async listLeads(campaignId: string): Promise<LeadRow[]> {
    return sql<LeadRow>("SELECT * FROM leads WHERE campaign_id = $1 ORDER BY seq", [
      campaignId,
    ]);
  },

  async listSelectedLeads(campaignId: string): Promise<LeadRow[]> {
    return sql<LeadRow>(
      "SELECT * FROM leads WHERE campaign_id = $1 AND selected ORDER BY seq",
      [campaignId],
    );
  },

  async getLead(id: string): Promise<LeadRow | undefined> {
    const rows = await sql<LeadRow>("SELECT * FROM leads WHERE id = $1", [id]);
    return rows[0];
  },

  async listDrafts(campaignId: string): Promise<DraftRow[]> {
    return sql<DraftRow>("SELECT * FROM drafts WHERE campaign_id = $1 ORDER BY seq", [
      campaignId,
    ]);
  },

  async getDraft(id: string): Promise<DraftRow | undefined> {
    const rows = await sql<DraftRow>("SELECT * FROM drafts WHERE id = $1", [id]);
    return rows[0];
  },

  async listTemplates(): Promise<EmailTemplateRow[]> {
    return sql<EmailTemplateRow>(
      "SELECT * FROM email_templates ORDER BY updated_at DESC, created_at DESC",
    );
  },

  async getTemplate(id: string): Promise<EmailTemplateRow | undefined> {
    const rows = await sql<EmailTemplateRow>("SELECT * FROM email_templates WHERE id = $1", [id]);
    return rows[0];
  },

  /** Sends in the trailing 24h — the throttle window. */
  async sendsInLastDay(): Promise<number> {
    const rows = await sql<{ n: string }>(
      "SELECT COUNT(*) AS n FROM sends WHERE status = 'sent' AND sent_at > now() - interval '24 hours'",
    );
    return Number(rows[0]?.n ?? 0);
  },

  async lastSendAt(): Promise<string | null> {
    const rows = await sql<{ sent_at: string }>(
      "SELECT sent_at FROM sends WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1",
    );
    return rows[0]?.sent_at ?? null;
  },

  async isSuppressed(email: string): Promise<boolean> {
    const rows = await sql("SELECT 1 FROM suppression WHERE email = $1", [
      email.toLowerCase(),
    ]);
    return rows.length > 0;
  },

  async suppress(email: string, reason: string): Promise<void> {
    await sql(
      `INSERT INTO suppression (email, reason) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason`,
      [email.toLowerCase(), reason],
    );
  },

  /** Has this address already been mailed from this campaign? */
  async alreadySent(campaignId: string, email: string): Promise<boolean> {
    const rows = await sql(
      "SELECT 1 FROM sends WHERE campaign_id = $1 AND email = $2 AND status = 'sent'",
      [campaignId, email.toLowerCase()],
    );
    return rows.length > 0;
  },
};
