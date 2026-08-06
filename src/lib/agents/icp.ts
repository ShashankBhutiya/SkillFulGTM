import { structured } from "../gemini";
import { env } from "../env";
import { IcpSchema, type CompanyInput, type Icp } from "../schemas";

const INSTRUCTIONS = `You are a go-to-market strategist. You are given a description of a company and its product, and you produce the ideal customer profile that follows from it.

Derive the profile from what the product actually does. If the product is an API rate limiter, the buyer is a platform engineering lead at a company with enough traffic to care — not "any tech company". Ground every part of the profile in a specific fact from the product description, and say which fact in the reasoning field.

Where the description is thin, narrow rather than broaden. A tight profile that is wrong is fixable; a profile that says "companies with 1-10000 employees in all industries" is not a profile.

Personas are individual humans with job titles, not departments. For each one, write the pain points in the words that person would use about their own work, not in the vendor's framing.

The sourcingQuery block drives real lead sourcing, in two stages, so it must be usable as-is:
- companySearchQueries are run through a web search engine to find COMPANIES that fit the profile. Write them the way you'd actually search to find in-market accounts — "Series B fintechs hiring data engineers", "mid-market logistics companies using SAP" — not descriptions of people. Specific queries find real companies; vague ones return noise.
- targetSeniorities, targetDepartments, and targetTitleKeywords are then used to pick the right people at each company. Keep targetTitleKeywords tight and lowercase — loose keywords pull in the wrong people.

Disqualifiers matter as much as the profile. List the accounts that will match on the surface and still waste the team's time.`;

export async function generateIcp(input: CompanyInput): Promise<Icp> {
  const user = [
    `Company: ${input.name}`,
    input.website && `Website: ${input.website}`,
    ``,
    `What the product does:`,
    input.productDescription,
    input.proofPoints && `\nProof points / results:\n${input.proofPoints}`,
    input.existingCustomers &&
      `\nCustomers they already have (the strongest signal available — look for what these have in common):\n${input.existingCustomers}`,
    input.pricing && `\nPricing:\n${input.pricing}`,
    input.notes && `\nOther context:\n${input.notes}`,
    ``,
    `Produce the ideal customer profile.`,
  ]
    .filter(Boolean)
    .join("\n");

  return structured({
    system: INSTRUCTIONS,
    user,
    schema: IcpSchema,
    // The ICP runs once per company — use the stronger model.
    model: env.geminiModel,
    temperature: 0.6,
  });
}
