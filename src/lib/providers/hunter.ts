import { env } from "../env";
import type { SourcedLead } from "./types";

/**
 * Hunter's Domain Search: given a company domain, return the people Hunter has
 * email addresses for, optionally filtered by seniority and department.
 * Docs: https://hunter.io/api-documentation/v2#domain-search
 */

const BASE = "https://api.hunter.io/v2";

type HunterEmail = {
  value?: string;
  type?: string; // "personal" | "generic"
  confidence?: number; // 0-100
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
  linkedin?: string | null;
};

type DomainSearchResponse = {
  data?: {
    domain?: string;
    organization?: string | null;
    emails?: HunterEmail[];
  };
  errors?: { details?: string }[];
};

/** Hunter confidence → the coarse status the rest of the app reasons about. */
function statusFromConfidence(c: number | undefined): string {
  if (c == null) return "unknown";
  if (c >= 80) return "high";
  if (c >= 50) return "medium";
  return "low";
}

export type HunterFilters = {
  seniorities: string[];
  departments: string[];
  titleKeywords: string[];
  /** Discard contacts below this Hunter confidence. */
  minConfidence: number;
};

async function domainSearch(
  domain: string,
  filters: HunterFilters,
  attempt = 1,
): Promise<HunterEmail[]> {
  const url = new URL(`${BASE}/domain-search`);
  url.searchParams.set("domain", domain);
  url.searchParams.set("api_key", env.hunterKey);
  url.searchParams.set("limit", "10");
  url.searchParams.set("type", "personal"); // skip info@ / sales@ role addresses
  // Hunter accepts comma-separated seniority/department filters.
  if (filters.seniorities.length) {
    url.searchParams.set("seniority", filters.seniorities.join(","));
  }
  if (filters.departments.length) {
    url.searchParams.set("department", filters.departments.join(","));
  }

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as DomainSearchResponse | null;
    const detail = body?.errors?.[0]?.details ?? (await res.text().catch(() => ""));
    const errorId = (body as { errors?: { id?: string }[] })?.errors?.[0]?.id ?? "";

    if (res.status === 401) {
      throw new Error(`Hunter rejected the API key (401). ${detail}`.trim());
    }
    if (res.status === 429) {
      const isQuota =
        errorId === "credits_exceeded" ||
        /quota|credit|allowance/i.test(detail);

      if (isQuota) {
        throw new Error(
          `Hunter monthly search credit cap reached (429). ${detail || "Your monthly quota has been exhausted. Upgrade your Hunter.io plan or wait for the monthly reset."}`,
        );
      }

      // If it's a transient per-second rate limit, pause and retry (up to 3 attempts)
      if (attempt <= 3) {
        const delay = attempt * 1200;
        await new Promise((r) => setTimeout(r, delay));
        return domainSearch(domain, filters, attempt + 1);
      }

      throw new Error(
        `Hunter API rate limit exceeded (429). Too many requests per second. ${detail}`,
      );
    }
    throw new Error(`Hunter error ${res.status}: ${String(detail).slice(0, 200)}`);
  }

  const data = (await res.json()) as DomainSearchResponse;
  return data.data?.emails ?? [];
}


type VerifyResponse = {
  data?: {
    status?: string;
    result?: string;
    score?: number;
  };
  errors?: { details?: string }[];
};

export type VerifyVerdict = {
  /** false only when the provider positively says the mailbox does not exist. */
  deliverable: boolean;
  /** true when we could not get an answer — caller decides whether to risk it. */
  unknown: boolean;
  detail: string;
};

/**
 * Checks a single address against Hunter's verifier before we send to it.
 *
 * A hard bounce is the most expensive mistake in cold email: mailbox providers
 * read them as a signal that the sender does not know who they are mailing, and
 * the damage to a young domain is not reversible. One verification call is much
 * cheaper than one bounce.
 *
 * Verification failures return `unknown` rather than blocking — losing the
 * ability to send because Hunter is out of credits would be worse than the risk.
 */
export async function verifyEmail(email: string): Promise<VerifyVerdict> {
  const url = new URL(`${BASE}/email-verifier`);
  url.searchParams.set("email", email);
  url.searchParams.set("api_key", env.hunterKey);

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const body = (await res.json().catch(() => null)) as VerifyResponse | null;

    if (!res.ok) {
      const detail = body?.errors?.[0]?.details ?? `HTTP ${res.status}`;
      return unverifiable(`verifier unavailable — ${detail}`);
    }

    const result = body?.data?.result ?? "unknown";
    const status = body?.data?.status ?? "unknown";

    if (result === "undeliverable") {
      return {
        deliverable: false,
        unknown: false,
        detail: `Hunter says undeliverable (${status}) — would hard bounce`,
      };
    }
    if (result === "risky") {
      // "accept_all" domains answer yes to every address at the gateway and only
      // reject at mailbox lookup — so they bounce *after* a clean SMTP handoff,
      // which is the one failure mode verification cannot rule out. On a young
      // sending domain a bounce costs more than a missed lead, so these are
      // skipped unless the operator explicitly opts in.
      return unverifiable(`unverifiable (${status}) — domain accepts all addresses`);
    }
    return { deliverable: true, unknown: false, detail: status };
  } catch (err) {
    return unverifiable(
      `verifier error — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Shared verdict for "we could not establish that this mailbox exists" —
 * whether because the domain accepts all addresses or because the verifier
 * itself was unreachable or out of credits.
 *
 * This deliberately fails CLOSED. Failing open would mean the safety check
 * silently stops working at exactly the moment it is most needed: when quota
 * is gone and nothing is being checked at all.
 */
function unverifiable(detail: string): VerifyVerdict {
  if (env.sendToRiskyAddresses) {
    return { deliverable: true, unknown: true, detail: `${detail} — sent anyway` };
  }
  return {
    deliverable: false,
    unknown: true,
    detail: `${detail}. Skipped to protect domain reputation; set SEND_TO_RISKY_ADDRESSES=true to send unverified.`,
  };
}

function titleMatches(position: string | null | undefined, keywords: string[]): boolean {
  if (!keywords.length) return true;
  if (!position) return false;
  const p = position.toLowerCase();
  return keywords.some((k) => p.includes(k.toLowerCase()));
}

/**
 * Pulls contacts for one company and normalizes them, applying the title-keyword
 * filter (which Hunter can't do server-side) and the confidence floor.
 */
export async function contactsForDomain(
  company: { domain: string; name: string; blurb?: string },
  filters: HunterFilters,
): Promise<SourcedLead[]> {
  const emails = await domainSearch(company.domain, filters);

  return emails
    .filter((e) => e.value && (e.confidence ?? 0) >= filters.minConfidence)
    .filter((e) => titleMatches(e.position, filters.titleKeywords))
    .map((e) => ({
      externalId: e.value ?? "",
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      title: e.position ?? "",
      email: e.value ?? "",
      emailStatus: statusFromConfidence(e.confidence),
      linkedinUrl: e.linkedin ?? "",
      companyName: company.name,
      companyDomain: company.domain,
      companyBlurb: company.blurb ?? "",
      raw: {
        seniority: e.seniority,
        department: e.department,
        confidence: e.confidence,
      },
    }));
}
