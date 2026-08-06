import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Storage is a local SQLite file via Node's built-in driver — no native module
 * to compile. Swap this file for a real database when you move off one machine;
 * nothing above it imports `node:sqlite` directly.
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  company_name  TEXT NOT NULL,
  company_input TEXT NOT NULL,        -- JSON: CompanyInput
  icp           TEXT,                 -- JSON: Icp
  status        TEXT NOT NULL,        -- draft | leads | drafted | sending | done
  created_at    TEXT NOT NULL
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
  selected       INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
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
  approved    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_lead ON drafts(lead_id);

CREATE TABLE IF NOT EXISTS sends (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  draft_id    TEXT NOT NULL,
  email       TEXT NOT NULL,
  status      TEXT NOT NULL,          -- sent | failed | skipped
  detail      TEXT NOT NULL DEFAULT '',
  message_id  TEXT NOT NULL DEFAULT '',
  sent_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sends_at ON sends(sent_at);

CREATE TABLE IF NOT EXISTS suppression (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function open(): DatabaseSync {
  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const handle = new DatabaseSync(join(dir, "skillful.db"));
  // WAL lets a reader and the writer coexist; the timeout covers the moment
  // where they don't.
  handle.exec("PRAGMA busy_timeout = 5000");
  handle.exec(SCHEMA);
  return handle;
}

// Opened on first query, never at import time: `next build` imports every route
// module across several worker processes, and opening a handle as an import
// side effect makes them race for the database lock.
//
// The handle is cached on globalThis because Next.js dev re-evaluates modules
// on every edit, which would otherwise leak a file handle per reload.
const globalRef = globalThis as unknown as { __skillfulDb?: DatabaseSync };

export function db(): DatabaseSync {
  return (globalRef.__skillfulDb ??= open());
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
  selected: number;
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
  approved: number;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const store = {
  getCampaign(id: string): CampaignRow | undefined {
    return db().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as
      | CampaignRow
      | undefined;
  },

  listCampaigns(): CampaignRow[] {
    return db()
      .prepare("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50")
      .all() as unknown as CampaignRow[];
  },

  listLeads(campaignId: string): LeadRow[] {
    return db()
      .prepare("SELECT * FROM leads WHERE campaign_id = ? ORDER BY rowid")
      .all(campaignId) as unknown as LeadRow[];
  },

  listSelectedLeads(campaignId: string): LeadRow[] {
    return db()
      .prepare(
        "SELECT * FROM leads WHERE campaign_id = ? AND selected = 1 ORDER BY rowid",
      )
      .all(campaignId) as unknown as LeadRow[];
  },

  getLead(id: string): LeadRow | undefined {
    return db().prepare("SELECT * FROM leads WHERE id = ?").get(id) as LeadRow | undefined;
  },

  listDrafts(campaignId: string): DraftRow[] {
    return db()
      .prepare("SELECT * FROM drafts WHERE campaign_id = ? ORDER BY rowid")
      .all(campaignId) as unknown as DraftRow[];
  },

  getDraft(id: string): DraftRow | undefined {
    return db().prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | undefined;
  },

  /** Sends in the trailing 24h — the throttle window. */
  sendsInLastDay(): number {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const row = db()
      .prepare("SELECT COUNT(*) AS n FROM sends WHERE status = 'sent' AND sent_at > ?")
      .get(since) as { n: number };
    return row.n;
  },

  lastSendAt(): string | null {
    const row = db()
      .prepare("SELECT sent_at FROM sends WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1")
      .get() as { sent_at: string } | undefined;
    return row?.sent_at ?? null;
  },

  isSuppressed(email: string): boolean {
    const row = db()
      .prepare("SELECT 1 AS x FROM suppression WHERE email = ?")
      .get(email.toLowerCase());
    return Boolean(row);
  },

  suppress(email: string, reason: string): void {
    db().prepare(
      "INSERT OR REPLACE INTO suppression (email, reason, created_at) VALUES (?, ?, ?)",
    ).run(email.toLowerCase(), reason, nowIso());
  },

  /** Has this address already been mailed from this campaign? */
  alreadySent(campaignId: string, email: string): boolean {
    const row = db()
      .prepare(
        "SELECT 1 AS x FROM sends WHERE campaign_id = ? AND email = ? AND status = 'sent'",
      )
      .get(campaignId, email.toLowerCase());
    return Boolean(row);
  },
};
