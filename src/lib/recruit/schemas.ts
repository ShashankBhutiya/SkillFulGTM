import { z } from "zod";

/**
 * Screening runs three model calls: a job description becomes criteria, a
 * resume becomes structured facts, and the two together become a score.
 *
 * Two rules shape every schema here, because both are the difference between a
 * screening a recruiter can defend and one they cannot:
 *
 *   1. Nothing asserted without a quote. Every extracted fact and every
 *      dimension score carries verbatim resume text. A field with no support
 *      is `absent`, never a guess — the model cannot emit a claim it has no
 *      room to cite.
 *   2. The overall score is not the model's. It is computed in code from the
 *      dimension scores (see `overallScore`), so a recruiter who overrides one
 *      dimension gets an arithmetically consistent total instead of a number
 *      only the model can explain.
 */

/* -------------------------------------------------------------------------- */
/* Stage 1 — job description → hiring criteria                                 */
/* -------------------------------------------------------------------------- */

export const RequirementSchema = z.object({
  text: z.string().describe("The requirement in a few words, e.g. 'Kubernetes in production'"),
  sourceQuote: z
    .string()
    .describe(
      "Verbatim sentence or clause from the job description that this requirement came from. Never paraphrase here.",
    ),
});

export const JobCriteriaSchema = z.object({
  title: z.string().describe("The role title as written in the job description"),
  summary: z
    .string()
    .describe("Two or three sentences describing who this role is actually looking for"),
  requiredSkills: z
    .array(RequirementSchema)
    .describe(
      "Skills the job description states as required. Only those actually stated — do not add skills that 'obviously' go with the role.",
    ),
  preferredSkills: z
    .array(RequirementSchema)
    .describe("Skills framed as preferred, bonus, or 'nice to have'"),
  mandatoryRequirements: z
    .array(RequirementSchema)
    .describe(
      "Hard gates that disqualify regardless of everything else — work authorization, a required licence or clearance, an on-site requirement. Only genuine gates; a skill listed as required is a required skill, not a gate.",
    ),
  experienceYearsMin: z
    .number()
    .describe("Minimum years of relevant experience stated. Use 0 if the description does not state one."),
  experienceYearsMax: z
    .number()
    .describe("Upper bound if the description gives a range, otherwise 0 for no stated ceiling."),
  educationRequirement: z
    .string()
    .describe(
      "Education as stated, e.g. \"Bachelor's in CS or equivalent practical experience\". Empty string if the description does not mention education.",
    ),
  educationIsMandatory: z
    .boolean()
    .describe(
      "True only if the description makes a degree a hard requirement. 'or equivalent experience' means false.",
    ),
  responsibilities: z
    .array(z.string())
    .describe("What the person will actually do day to day, as stated"),
  keywords: z
    .array(z.string())
    .describe(
      "Lowercase terms worth matching against a resume — technologies, domains, methodologies. Tight and specific; 'software' is noise, 'kubernetes' is signal.",
    ),
  reasoning: z
    .string()
    .describe(
      "How you read this description: which requirements are genuinely load-bearing versus boilerplate, and anything ambiguous the recruiter should resolve.",
    ),
});
export type JobCriteria = z.infer<typeof JobCriteriaSchema>;

/**
 * Per-dimension weights that turn dimension scores into an overall score.
 * Stored per job so a recruiter can say experience matters more than education
 * on this particular req, and see the total move.
 */
export const WeightsSchema = z.object({
  skillMatch: z.number().min(0).max(100),
  experienceMatch: z.number().min(0).max(100),
  educationMatch: z.number().min(0).max(100),
  projectRelevance: z.number().min(0).max(100),
  domainExperience: z.number().min(0).max(100),
});
export type Weights = z.infer<typeof WeightsSchema>;

export const DEFAULT_WEIGHTS: Weights = {
  skillMatch: 35,
  experienceMatch: 25,
  projectRelevance: 20,
  domainExperience: 12,
  educationMatch: 8,
};

/* -------------------------------------------------------------------------- */
/* Stage 2 — resume → structured facts                                         */
/* -------------------------------------------------------------------------- */

/**
 * How firmly the resume supports a skill. The distinction is the whole point:
 * a keyword in a comma-separated list is weaker evidence than the same word
 * attached to something the candidate says they built, and the scorer is told
 * to treat them differently.
 */
export const SkillBasis = z.enum([
  "used_in_role",
  "used_in_project",
  "listed_in_skills_section",
  "mentioned_in_passing",
]);

export const SkillSchema = z.object({
  name: z.string().describe("The skill, normalised, e.g. 'PostgreSQL' not 'postgres db'"),
  basis: SkillBasis,
  sourceQuote: z
    .string()
    .describe("Verbatim resume text mentioning this skill. Required — never invent or paraphrase."),
});

export const RoleSchema = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string().describe("As written on the resume, e.g. 'Mar 2021'. Empty string if absent."),
  endDate: z.string().describe("As written, e.g. 'Present'. Empty string if absent."),
  months: z
    .number()
    .describe(
      "Duration in months, computed from the dates as written. Use 0 when the dates are too vague to compute — do not estimate.",
    ),
  highlights: z.array(z.string()).describe("Verbatim bullet points from this role"),
});

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string().describe("Verbatim or near-verbatim from the resume"),
  technologies: z.array(z.string()),
  sourceQuote: z.string().describe("The resume text this project came from"),
});

export const ParsedResumeSchema = z.object({
  name: z.string().describe("Candidate name as it appears on the resume. Empty string if not found."),
  email: z.string().describe("Empty string if not on the resume"),
  phone: z.string().describe("Empty string if not on the resume"),
  location: z.string().describe("Empty string if not on the resume"),
  totalYearsExperience: z
    .number()
    .describe(
      "Total professional years, summed from the role timeline only. Use 0 if the dates do not support a calculation — an unknown is a 0 here paired with an entry in missingInformation, never an estimate.",
    ),
  experienceIsCalculable: z
    .boolean()
    .describe("False when dates were missing or too vague to total. Makes the 0 above readable."),
  skills: z.array(SkillSchema),
  roles: z.array(RoleSchema).describe("Employment history, most recent first"),
  projects: z.array(ProjectSchema),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string().describe("As written; empty string if absent"),
      }),
    )
    .describe("Empty array if the resume has no education section"),
  certifications: z.array(z.string()),
  achievements: z
    .array(z.string())
    .describe("Verbatim claims of measurable impact — awards, quantified outcomes, publications"),
  employmentGaps: z
    .array(z.string())
    .describe(
      "Unexplained gaps of six months or more between roles, stated neutrally as 'Mar 2020 - Jan 2021'. Observation only, never a judgement — career breaks are common and lawful reasons for them are none of the employer's business.",
    ),
  missingInformation: z
    .array(z.string())
    .describe(
      "What a recruiter would want that this resume does not contain, e.g. 'No dates on the Acme role', 'Lists Kubernetes but no context for it'. This drives follow-up questions.",
    ),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

/* -------------------------------------------------------------------------- */
/* Stage 3 — criteria + resume → screening                                     */
/* -------------------------------------------------------------------------- */

export const DimensionSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z
    .string()
    .describe("Why this score and not ten points higher or lower. Reference the criteria explicitly."),
  evidence: z
    .array(z.string())
    .describe(
      "Verbatim quotes from the resume that justify the score. An empty array is only valid when the score reflects absence — and then say so in the reasoning.",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Low when the resume was too thin to judge this dimension fairly."),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const FollowUpQuestionSchema = z.object({
  question: z
    .string()
    .describe(
      "A question only answerable by this candidate about this resume. 'Describe the rollback strategy on the Kubernetes migration you led at Acme' — never 'Tell me about your experience with Kubernetes'.",
    ),
  targets: z
    .enum(["missing_information", "weak_claim", "ambiguous_experience", "skill_verification"])
    .describe("Which gap this question closes"),
  evidenceQuote: z
    .string()
    .describe(
      "The exact resume text that prompted this question. A question with no anchoring quote does not belong here.",
    ),
});

export const ScreeningSchema = z.object({
  dimensions: z.object({
    skillMatch: DimensionSchema,
    experienceMatch: DimensionSchema,
    educationMatch: DimensionSchema,
    projectRelevance: DimensionSchema,
    domainExperience: DimensionSchema,
  }),
  mandatoryGates: z
    .array(
      z.object({
        requirement: z.string(),
        status: z
          .enum(["met", "not_met", "unknown"])
          .describe("'unknown' when the resume simply does not say. This is not 'not_met'."),
        evidence: z.string().describe("Resume quote, or empty string when the status is unknown"),
      }),
    )
    .describe("One entry per mandatory requirement from the criteria"),
  strengths: z.array(z.string()).describe("Each tied to something the resume actually says"),
  weaknesses: z
    .array(z.string())
    .describe("Genuine gaps against the criteria — not absence of information, which belongs below"),
  missingSkills: z
    .array(z.string())
    .describe("Required skills with no support anywhere in the resume"),
  risks: z
    .array(z.string())
    .describe(
      "What could go wrong in this hire, drawn from the resume. Job-related only: never infer risk from a name, a school, a country, a career break, or a graduation year.",
    ),
  followUpQuestions: z
    .array(FollowUpQuestionSchema)
    .describe("Three to six questions that would resolve the biggest uncertainties here"),
  summary: z.string().describe("Three or four sentences a recruiter could paste into a hiring channel"),
});
export type Screening = z.infer<typeof ScreeningSchema>;

/**
 * The overall score, computed rather than generated.
 *
 * The model never emits this number. Deriving it here is what makes recruiter
 * overrides coherent: change one dimension in the dashboard and the total
 * follows by the same arithmetic that produced it in the first place, with the
 * weights visible on screen.
 */
export function overallScore(
  dimensions: Screening["dimensions"],
  weights: Weights = DEFAULT_WEIGHTS,
): number {
  const pairs = [
    [dimensions.skillMatch.score, weights.skillMatch],
    [dimensions.experienceMatch.score, weights.experienceMatch],
    [dimensions.educationMatch.score, weights.educationMatch],
    [dimensions.projectRelevance.score, weights.projectRelevance],
    [dimensions.domainExperience.score, weights.domainExperience],
  ] as const;

  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return 0;
  const weighted = pairs.reduce((sum, [score, w]) => sum + score * w, 0);
  return Math.round(weighted / total);
}

/**
 * A failed mandatory gate caps the score but never zeroes it, and an `unknown`
 * gate does not cap at all. Rejecting on a silent resume is how good candidates
 * get screened out for not having anticipated the question.
 */
export function applyGates(
  score: number,
  gates: Screening["mandatoryGates"],
): { score: number; capped: boolean } {
  const failed = gates.some((g) => g.status === "not_met");
  if (!failed) return { score, capped: false };
  return { score: Math.min(score, 40), capped: true };
}

/* -------------------------------------------------------------------------- */
/* Recommendation                                                              */
/* -------------------------------------------------------------------------- */

export const RECOMMENDATIONS = ["strong_hire", "hire", "borderline", "reject"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/**
 * Bands, not a model judgement — so two candidates with the same score always
 * get the same label, and the recruiter can see exactly where the line sits.
 */
export function recommend(score: number): Recommendation {
  if (score >= 80) return "strong_hire";
  if (score >= 65) return "hire";
  if (score >= 45) return "borderline";
  return "reject";
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  borderline: "Borderline",
  reject: "Reject",
};

/* -------------------------------------------------------------------------- */
/* Spreadsheet import                                                          */
/* -------------------------------------------------------------------------- */

/** One row as it arrives from the recruiter's sheet. Everything is optional
 *  except a name — real sheets are ragged, and rejecting the file because one
 *  row lacks a phone number helps nobody. */
export const CandidateRowSchema = z.object({
  name: z.string().min(1),
  resumeLink: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  currentCompany: z.string().default(""),
  currentRole: z.string().default(""),
  experience: z.string().default(""),
  location: z.string().default(""),
  notes: z.string().default(""),
});
export type CandidateRow = z.infer<typeof CandidateRowSchema>;
