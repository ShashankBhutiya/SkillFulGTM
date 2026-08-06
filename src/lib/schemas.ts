import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

export const CompanyInput = z.object({
  name: z.string().min(1, "Company name is required"),
  website: z.string().default(""),
  productDescription: z
    .string()
    .min(40, "Describe the product in at least a couple of sentences — this is what the ICP is derived from"),
  proofPoints: z.string().default(""),
  existingCustomers: z.string().default(""),
  pricing: z.string().default(""),
  notes: z.string().default(""),
});
export type CompanyInput = z.infer<typeof CompanyInput>;

/* -------------------------------------------------------------------------- */
/* ICP — the model's output                                                    */
/*                                                                             */
/* `sourcingQuery` is deliberately part of the generated artifact. Sourcing is  */
/* two stages: Exa web-search finds companies matching the profile, then Hunter */
/* finds contactable people at each company's domain. The ICP agent emits both  */
/* the Exa queries and the Hunter role filters, so sourcing is a direct         */
/* translation of the profile rather than a second layer of guesswork.          */
/* -------------------------------------------------------------------------- */

/**
 * Seniority buckets Hunter's Domain Search accepts as a filter.
 * (Hunter collapses seniority into just these three.)
 */
export const Seniority = z.enum(["junior", "senior", "executive"]);

/** Department values Hunter's Domain Search accepts as a filter. */
export const Department = z.enum([
  "executive",
  "it",
  "finance",
  "management",
  "sales",
  "legal",
  "support",
  "hr",
  "marketing",
  "communication",
  "education",
  "design",
  "health",
  "operations",
]);

export const PersonaSchema = z.object({
  label: z.string().describe("Short name for this persona, e.g. 'VP of Revenue Operations'"),
  seniority: Seniority.describe("Closest of the three seniority buckets: junior, senior, or executive"),
  department: z.string().describe("Function they sit in, e.g. 'Sales', 'Engineering', 'Finance'"),
  roleInDeal: z
    .enum(["economic_buyer", "champion", "technical_evaluator", "end_user", "blocker"])
    .describe("How this persona influences the purchase decision"),
  painPoints: z
    .array(z.string())
    .describe("Concrete problems this persona owns, phrased the way they would describe them"),
  valueProps: z
    .array(z.string())
    .describe("What specifically to say to this persona — not generic product benefits"),
  objections: z.array(z.string()).describe("What they will push back on first"),
});

export const IcpSchema = z.object({
  summary: z
    .string()
    .describe("Two or three sentences a salesperson could repeat verbatim to describe who to target"),
  reasoning: z
    .string()
    .describe("Why this profile follows from the product described — cite the specific product facts used"),
  firmographics: z.object({
    industries: z.array(z.string()),
    employeeMin: z.number().describe("Lower bound of company headcount"),
    employeeMax: z.number().describe("Upper bound of company headcount"),
    revenueBand: z.string().describe("Human-readable revenue range, e.g. '$5M-$50M ARR'"),
    geographies: z.array(z.string()).describe("Countries or regions, e.g. 'United States'"),
    technologies: z.array(z.string()).describe("Tools in their stack that signal a fit"),
  }),
  personas: z.array(PersonaSchema).describe("Three to five members of the buying committee"),
  triggerSignals: z
    .array(z.string())
    .describe("Observable events that mean this account is in-market right now"),
  disqualifiers: z
    .array(z.string())
    .describe("Traits that make an account a bad fit despite matching on paper"),
  sourcingQuery: z
    .object({
      companySearchQueries: z
        .array(z.string())
        .describe(
          "Three to six natural-language web searches that surface COMPANIES matching this profile — not people. Each should read like something you'd type into a search engine to find in-market accounts, e.g. 'Series B fintech companies hiring data engineers' or 'mid-market logistics firms using SAP'. Specific beats broad.",
        ),
      targetSeniorities: z
        .array(Seniority)
        .describe("Which seniority buckets to keep when pulling contacts at each company"),
      targetDepartments: z
        .array(Department)
        .describe("Which departments the buying-committee personas sit in"),
      targetTitleKeywords: z
        .array(z.string())
        .describe(
          "Lowercase keywords to match against a contact's job title, e.g. 'revenue', 'data', 'head of growth'. A contact is kept if their title contains any of these. Keep it tight — loose keywords pull in the wrong people.",
        ),
    })
    .describe(
      "How to source real leads for this profile: Exa queries to find the companies, plus Hunter filters to pick the right people at each one.",
    ),
});
export type Icp = z.infer<typeof IcpSchema>;

/* -------------------------------------------------------------------------- */
/* Per-lead email draft                                                        */
/* -------------------------------------------------------------------------- */

export const DraftSchema = z.object({
  subject: z
    .string()
    .describe(
      "3-7 words, lowercase, no punctuation or emoji. Must reference the specific thing the email is about — a detail from their company, or the problem being named. NEVER the template '<topic> for <company>' (e.g. 'outbound for acme'), and never just restating the sender's category. It should read like a subject from someone who knows what the company does.",
    ),
  body: z
    .string()
    .describe(
      "Plain text, 90-160 words across 3-4 short paragraphs separated by blank lines. No greeting line, no signature, no unsubscribe text — those are appended by the system.",
    ),
  personalizationBasis: z
    .string()
    .describe(
      "The specific fact about this person or company the email is built on, and where it came from. Say 'none — generic' if there wasn't one.",
    ),
  matchedPersona: z.string().describe("Which ICP persona this lead was matched to"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Low if the available data was too thin to personalize honestly"),
});
export type Draft = z.infer<typeof DraftSchema>;
