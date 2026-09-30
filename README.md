# SkillfulGTM

Agentic GTM. You describe your company once; the app derives an ideal customer
profile, finds real people who match it, writes an email for each one, and sends
from your own mailbox — with a human approval gate before anything leaves.

The template bulk-email path can also import up to 1,000 recipients from CSV,
merge standard or custom columns into reusable subject/body templates, preview
every rendered message, and feed approved drafts through the same guarded send
pipeline. It does not require Gemini, Exa, or Hunter credentials.

Recipients can also be entered column by column: paste newline-separated values
from Excel or Sheets into standard fields, add custom columns, and append them
to or replace the current campaign list. Lines stay aligned across columns.

```
Company description
      │
      ▼  ICP agent          Gemini (main model), one call per company
   ICP  ──────────────────  personas, firmographics, triggers, disqualifiers
      │                     …and a two-stage sourcing plan
      ▼  Exa                web search → companies matching the ICP (domains)
      ▼  Hunter             domain search → contactable people + emails
   Leads ─────────────────  you pick who stays in
      │
      ▼  Copy agent         Gemini (fast model), one call per lead
  Drafts ─────────────────  you edit, you approve
      │
      ▼  SMTP               paced, suppression-checked, unsubscribe-stamped
   Sent
```

## Setup

```bash
cp .env.example .env.local   # then fill it in
npm run dev
```

`.env.local` already exists with a generated `UNSUBSCRIBE_SECRET`. You need to add:

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Neon / Supabase / Vercel Postgres — use the **pooled** connection string |
| `GEMINI_API_KEYS` | aistudio.google.com/apikey — one key, or several comma-separated |
| `EXA_API_KEY` | dashboard.exa.ai |
| `HUNTER_API_KEY` | hunter.io → API |
| `CREDENTIALS_ENCRYPTION_KEY` | A stable 32+ byte secret used to encrypt user mailbox credentials |
| `AUTH_SMTP_*` | Platform mailbox used only for verification and password-reset email |

Open http://localhost:3000.

After creating an account, each user connects their own sending mailbox under
**Account settings**. Campaign SMTP credentials are encrypted at rest and are
never sent back to the browser.

### SMTP for common providers

| Provider | Host | Port | Password |
| --- | --- | --- | --- |
| Google Workspace | `smtp.gmail.com` | 587 | App Password (requires 2FA enabled) |
| Microsoft 365 | `smtp.office365.com` | 587 | Account or app password |
| Zoho Mail | `smtp.zoho.com` | 587 | App-specific password |

The From address must usually match the SMTP username or be a verified alias,
or the provider will rewrite or reject the message.

## How the pieces fit

| Path | Role |
| --- | --- |
| `src/lib/agents/icp.ts` | Company description → ICP. Emits an Exa+Hunter sourcing plan as part of its output, so lead sourcing is a translation rather than a second guess. |
| `src/lib/agents/draft.ts` | ICP + one lead → one email. |
| `src/lib/gemini.ts` | Structured-output calls, key round-robin, error mapping. |
| `src/lib/providers/exa.ts` | Stage 1: ICP search queries → company domains. |
| `src/lib/providers/hunter.ts` | Stage 2: a domain → contactable people with emails. |
| `src/lib/providers/index.ts` | Combines both behind a `LeadProvider` interface — swap the source without touching the agents. |
| `src/lib/email/` | Compose, suppression, throttle, signed unsubscribe. |
| `src/app/api/templates/` | Create, update, list, and delete reusable bulk-email templates. |
| `src/app/api/leads/import/` | Validate and import CSV recipient data and custom merge fields. |
| `src/lib/db.ts` | Postgres via `pg`. Async throughout — serverless filesystems are read-only and ephemeral, so the suppression list cannot live in a local file. |

### Models and cost

Both agents run on **Gemini**, differing by model, not by an effort dial (Gemini
has none): the ICP agent (once per company) uses `GEMINI_MODEL`, and the drafting
agent (once per lead, the volume path) uses `GEMINI_FAST_MODEL`.

`GEMINI_API_KEYS` accepts several comma-separated keys. They are round-robined
across calls, which matters on the drafting pass — Gemini's per-key rate limits
are low, and a large batch makes one call per lead. Add more keys if you hit 429s.

There is no prompt caching: the per-campaign context (sender + ICP) is re-sent
with every drafting call. That was an Anthropic-specific optimization; Gemini's
context caching is a separate, heavier API not worth wiring up at this scale.

## Deliverability and compliance

You are sending cold email from your real work domain. Reputation damage there
is slow to undo, so these are wired into the send path rather than left as
options:

- **Signed unsubscribe link** in every message, plus `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers so Gmail and Outlook render a native
  unsubscribe button — which is what people click *instead of* "report spam".
- **Opt-out happens on POST, not GET.** Corporate security scanners follow every
  link in an inbound email; an unsubscribe that fires on GET silently opts out
  people who never clicked.
- **Per-user suppression list** checked before every send and enforced across that user's campaigns.
- **Per-user throttle** — configured under Account settings. A domain with
  no sending history should start near 20/day and ramp over about four weeks.
  The defaults here (40/day, 45s apart) assume a warmed domain.
- **Physical postal address** in the footer. Every user must configure one and
  verify their mailbox before the app will send.

## Accounts and data isolation

- Email/password accounts use scrypt password hashes and revocable, HTTP-only sessions.
- Signup email verification and expiring password-reset links use `AUTH_SMTP_*`.
- On localhost only, new accounts are automatically verified when `AUTH_SMTP_*`
  is absent so local development is not blocked. Public production deployments
  still require account-email delivery.
- Campaigns, leads, drafts, templates, send history, limits, jobs, and suppression
  entries are all resolved through the authenticated account.
- SMTP passwords use AES-256-GCM encryption with `CREDENTIALS_ENCRYPTION_KEY`.
- On the first signup after upgrading an existing installation, unowned legacy
  campaigns, templates, sends, and suppression entries are assigned to that account.

Before your first real batch, confirm SPF, DKIM, and DMARC are set up on your
sending domain. Without them a meaningful share of your mail lands in spam
regardless of how good the copy is.

GDPR is stricter than CAN-SPAM and is not addressed by the above: if you are
mailing people in the EU or UK, you need a lawful basis for processing their
data, and web-sourced contacts do not by themselves give you one.

## Things worth knowing

- **Sourcing spends Exa and Hunter credits.** Exa is billed per search; Hunter
  per domain lookup. The app stops early once it has enough leads (or on the
  first credit/rate error) rather than walking the whole company list.
- **Hunter only finds what it has.** Domain Search returns the people Hunter has
  on file for a company — it won't surface a role nobody's published an address
  for. Thin results usually mean the title keywords or seniority/department
  filters are too tight; loosen them on the ICP screen and re-run.
- **Sending runs as a durable background job.** Pacing means a batch outlives an
  HTTP request, so `/api/send` stores progress in Postgres and the UI polls it.
  Renewable worker leases let another instance resume when the progress page
  polls after a restart. Successful sends are excluded from subsequent batches;
  failed and skipped recipients can be retried. Only one campaign per mailbox
  runs at a time. This currently depends on progress polling and a running Node
  process; unattended serverless delivery needs a scheduled queue worker.
  SMTP acceptance and the database write cannot be committed atomically, so a
  process crash between them can still leave an uncertain delivery outcome.
- **Low-confidence drafts are flagged.** The copy agent is instructed to
  personalize only from data it actually has, and to mark a draft `low` when all
  it had was a job title. Read those before approving — a fabricated detail is
  worse than a plainer email, and it is your name on the message.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm test           # account, mailbox, and failure-path regression checks
```
