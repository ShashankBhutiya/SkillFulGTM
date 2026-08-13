import type { Icp } from "../schemas";
import { discoverCompanies } from "./exa";
import { contactsForDomain, type HunterFilters } from "./hunter";
import type { LeadProvider, SearchResult, SourcedLead } from "./types";

/** Hunter confidence floor for a contact to be kept. */
const MIN_CONFIDENCE = 50;

/**
 * Two-stage sourcing:
 *   1. Exa turns the ICP's search queries into a set of company domains.
 *   2. Hunter turns each domain into contactable people, filtered to the ICP's
 *      target roles.
 *
 * This lives behind the same LeadProvider interface the rest of the app used
 * for Apollo, so nothing upstream changed when the source did.
 */
export class ExaHunterProvider implements LeadProvider {
  readonly name = "exa+hunter";

  async search(icp: Icp, limit: number): Promise<SearchResult> {
    const q = icp.sourcingQuery;
    const warnings: string[] = [];

    const { companies, warnings: exaWarnings } = await discoverCompanies(
      q.companySearchQueries,
      limit,
    );
    warnings.push(...exaWarnings);

    const filters: HunterFilters = {
      seniorities: q.targetSeniorities,
      departments: q.targetDepartments,
      titleKeywords: q.targetTitleKeywords,
      minConfidence: MIN_CONFIDENCE,
    };

    const leads: SourcedLead[] = [];
    const seenEmails = new Set<string>();
    let companiesTried = 0;

    for (const company of companies) {
      if (leads.length >= limit) break;
      if (companiesTried > 0) {
        // Pacing delay between calls to respect Hunter per-second API limits
        await new Promise((r) => setTimeout(r, 350));
      }
      companiesTried += 1;
      try {
        const found = await contactsForDomain(company, filters);
        for (const lead of found) {
          const key = lead.email.toLowerCase();
          if (!key || seenEmails.has(key)) continue;
          seenEmails.add(key);
          leads.push(lead);
          if (leads.length >= limit) break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Hunter lookup for ${company.domain} failed: ${msg}`);
        // A credit/rate ceiling will hit every subsequent call too — stop early
        // rather than burning through the company list producing the same error.
        if (/429|401/.test(msg)) break;
      }
    }


    if (!leads.length && companiesTried > 0) {
      warnings.push(
        `Searched ${companiesTried} companies but found no contacts matching the role filters. Loosen targetTitleKeywords or the seniority/department filters.`,
      );
    }

    return { leads, totalAvailable: companies.length, warnings };
  }
}

export function leadProvider(): LeadProvider {
  // WEB_SEARCH_PROVIDER is read for forward-compatibility; Exa is the only
  // discovery backend wired up today.
  return new ExaHunterProvider();
}
