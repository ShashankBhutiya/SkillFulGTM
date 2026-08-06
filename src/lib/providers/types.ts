import type { Icp } from "../schemas";

/** Normalized lead shape. Nothing above this layer knows the data source. */
export type SourcedLead = {
  externalId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  /** e.g. "verified", "guessed", "locked", "unavailable" */
  emailStatus: string;
  linkedinUrl: string;
  companyName: string;
  companyDomain: string;
  companyBlurb: string;
  /** Extra signals passed through to the drafting agent. */
  raw: Record<string, unknown>;
};

export type SearchResult = {
  leads: SourcedLead[];
  totalAvailable: number;
  /** Non-fatal problems worth showing the user (e.g. enrichment skipped). */
  warnings: string[];
};

export interface LeadProvider {
  readonly name: string;
  search(icp: Icp, limit: number): Promise<SearchResult>;
}
