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
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expiry ON auth_tokens(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_at ON login_attempts(email, attempted_at DESC);

CREATE TABLE IF NOT EXISTS mailboxes (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  host               TEXT NOT NULL,
  port               INTEGER NOT NULL,
  secure             BOOLEAN NOT NULL DEFAULT FALSE,
  username           TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  from_name          TEXT NOT NULL DEFAULT '',
  from_email         TEXT NOT NULL,
  reply_to           TEXT NOT NULL DEFAULT '',
  postal_address     TEXT NOT NULL,
  max_sends_per_day  INTEGER NOT NULL DEFAULT 40,
  seconds_between    INTEGER NOT NULL DEFAULT 45,
  verified_at        TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'password';

CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
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
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  draft_id    TEXT NOT NULL,
  email       TEXT NOT NULL,
  status      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  message_id  TEXT NOT NULL DEFAULT '',
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sends_at ON sends(sent_at);

CREATE TABLE IF NOT EXISTS send_jobs (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  total        INTEGER NOT NULL DEFAULT 0,
  done         INTEGER NOT NULL DEFAULT 0,
  outcomes     JSONB NOT NULL DEFAULT '[]'::jsonb,
  error        TEXT NOT NULL DEFAULT '',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until  TIMESTAMPTZ,
  PRIMARY KEY (user_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS suppression (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_suppression (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, email)
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sends ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sends_user_at ON sends(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_user ON email_templates(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_send_jobs_status ON send_jobs(status, lease_until);
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
  user_id: string | null;
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

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified: boolean;
  created_at: string;
};

export type MailboxRow = {
  auth_type: "password" | "google";
  user_id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password_encrypted: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  postal_address: string;
  max_sends_per_day: number;
  seconds_between: number;
  verified_at: string | null;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const store = {
  async getCampaign(userId: string, id: string): Promise<CampaignRow | undefined> {
    const rows = await sql<CampaignRow>(
      "SELECT * FROM campaigns WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return rows[0];
  },

  async listCampaigns(userId: string): Promise<CampaignRow[]> {
    return sql<CampaignRow>(
      "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId],
    );
  },

  async listLeads(userId: string, campaignId: string): Promise<LeadRow[]> {
    return sql<LeadRow>(
      `SELECT l.* FROM leads l JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.campaign_id = $1 AND c.user_id = $2 ORDER BY l.seq`,
      [campaignId, userId],
    );
  },

  async listSelectedLeads(userId: string, campaignId: string): Promise<LeadRow[]> {
    return sql<LeadRow>(
      `SELECT l.* FROM leads l JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.campaign_id = $1 AND c.user_id = $2 AND l.selected ORDER BY l.seq`,
      [campaignId, userId],
    );
  },

  async getLead(userId: string, id: string): Promise<LeadRow | undefined> {
    const rows = await sql<LeadRow>(
      `SELECT l.* FROM leads l JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    return rows[0];
  },

  async listDrafts(userId: string, campaignId: string): Promise<DraftRow[]> {
    return sql<DraftRow>(
      `SELECT d.* FROM drafts d JOIN campaigns c ON c.id = d.campaign_id
       WHERE d.campaign_id = $1 AND c.user_id = $2 ORDER BY d.seq`,
      [campaignId, userId],
    );
  },

  async getDraft(userId: string, id: string): Promise<DraftRow | undefined> {
    const rows = await sql<DraftRow>(
      `SELECT d.* FROM drafts d JOIN campaigns c ON c.id = d.campaign_id
       WHERE d.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    return rows[0];
  },

  async listTemplates(userId: string): Promise<EmailTemplateRow[]> {
    return sql<EmailTemplateRow>(
      "SELECT * FROM email_templates WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC",
      [userId],
    );
  },

  async getTemplate(userId: string, id: string): Promise<EmailTemplateRow | undefined> {
    const rows = await sql<EmailTemplateRow>(
      "SELECT * FROM email_templates WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return rows[0];
  },

  /** Sends in the trailing 24h — the throttle window. */
  async sendsInLastDay(userId: string): Promise<number> {
    const rows = await sql<{ n: string }>(
      "SELECT COUNT(*) AS n FROM sends WHERE user_id = $1 AND status = 'sent' AND sent_at > now() - interval '24 hours'",
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  },

  async lastSendAt(userId: string): Promise<string | null> {
    const rows = await sql<{ sent_at: string }>(
      "SELECT sent_at FROM sends WHERE user_id = $1 AND status = 'sent' ORDER BY sent_at DESC LIMIT 1",
      [userId],
    );
    return rows[0]?.sent_at ?? null;
  },

  async isSuppressed(userId: string, email: string): Promise<boolean> {
    const rows = await sql(
      "SELECT 1 FROM user_suppression WHERE user_id = $1 AND email = $2",
      [userId, email.toLowerCase()],
    );
    return rows.length > 0;
  },

  async suppress(userId: string, email: string, reason: string): Promise<void> {
    await sql(
      `INSERT INTO user_suppression (user_id, email, reason) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, email) DO UPDATE SET reason = EXCLUDED.reason`,
      [userId, email.toLowerCase(), reason],
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
