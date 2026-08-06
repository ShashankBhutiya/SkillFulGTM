import Exa from "exa-js";
import { env } from "../env";

let client: Exa | null = null;
function exa(): Exa {
  if (!client) client = new Exa(env.exaKey);
  return client;
}

export type DiscoveredCompany = {
  domain: string;
  name: string;
  sourceUrl: string;
  /**
   * What the company actually does, read off their own site. This is the only
   * real personalization material the copy agent gets — without it every email
   * is written from a job title and a domain name.
   */
  blurb: string;
};

/**
 * Asked of each company's homepage. Deliberately narrow: the copy agent needs
 * something concrete to open on, not a paragraph of marketing adjectives.
 */
const SUMMARY_QUERY =
  "In 2-4 sentences: what does this company sell, who is their customer, and what stage or size are they? State only what the page actually says. No marketing adjectives.";

/** Strips a URL down to its registrable-ish domain, dropping common www. */
function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Domains that are never a prospect company — content farms, directories, social.
const JUNK_DOMAINS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "medium.com",
  "crunchbase.com",
  "wikipedia.org",
  "reddit.com",
  "glassdoor.com",
  "indeed.com",
  "g2.com",
  "capterra.com",
  "github.com",
]);

/**
 * Runs the ICP's company-discovery searches through Exa and returns unique
 * company domains. Each query is capped so one broad query can't crowd out the
 * others, and results are deduped by domain across all queries.
 */
export async function discoverCompanies(
  queries: string[],
  wanted: number,
): Promise<{ companies: DiscoveredCompany[]; warnings: string[] }> {
  const warnings: string[] = [];
  const byDomain = new Map<string, DiscoveredCompany>();
  const perQuery = Math.max(5, Math.ceil((wanted * 2) / Math.max(queries.length, 1)));

  for (const query of queries) {
    if (byDomain.size >= wanted * 2) break;
    try {
      // `category: "company"` biases Exa toward company homepages rather than
      // blog posts or news about them. Pulling the summary here rather than in
      // a second pass means the blurb costs no extra round trip.
      const res = (await exa().searchAndContents(query, {
        numResults: perQuery,
        category: "company",
        type: "auto",
        summary: { query: SUMMARY_QUERY },
      })) as {
        results?: { url?: string; title?: string; summary?: string }[];
      };

      for (const r of res.results ?? []) {
        if (!r.url) continue;
        const domain = domainOf(r.url);
        if (!domain || JUNK_DOMAINS.has(domain) || byDomain.has(domain)) continue;
        byDomain.set(domain, {
          domain,
          name: (r.title ?? domain).replace(/\s*[|\-–].*$/, "").trim() || domain,
          sourceUrl: r.url,
          blurb: (r.summary ?? "").trim(),
        });
      }
    } catch (err) {
      warnings.push(
        `Exa query "${query}" failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!byDomain.size && !warnings.length) {
    warnings.push("Exa returned no companies for these queries. Try broadening them.");
  }

  return { companies: [...byDomain.values()], warnings };
}
