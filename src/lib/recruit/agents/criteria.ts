import { structured } from "../../gemini";
import { env } from "../../env";
import { JobCriteriaSchema, type JobCriteria } from "../schemas";

const INSTRUCTIONS = `You are a technical recruiter reading a job description and turning it into the criteria a screener will actually apply.

Extract only what the description says. Job descriptions are written loosely and read strictly, and the gap between those is where bad screening comes from — so if the description does not mention testing, "writes tests" is not a requirement, however reasonable it sounds for the role.

Separate the three tiers carefully, because they are weighted differently downstream:
- requiredSkills — stated as required, expected, or written as part of the core job.
- preferredSkills — hedged: "bonus", "nice to have", "a plus", "ideally".
- mandatoryRequirements — hard gates that disqualify on their own regardless of merit: work authorization, a licence, a security clearance, a mandatory on-site location. A programming language is never a gate. Be strict here: everything you list will be applied as a pass/fail test against a resume, and over-listing rejects good people mechanically.

Every requirement carries a sourceQuote — the description's own words, copied exactly. If you cannot quote it, it is not in the description and does not belong in the criteria.

On experience: use only a number the description states. "Senior" is a title, not a year count; if no number appears, use 0 rather than inferring one from seniority language.

On education: set educationIsMandatory true only for an unhedged degree requirement. "or equivalent experience", "or equivalent practical experience", and "degree preferred" all mean false.

Keywords are for matching against resume text. Include technologies, domains, and methodologies actually named. Exclude words that match everything — "software", "engineering", "team", "development" are noise.

In reasoning, say which requirements look load-bearing versus boilerplate, and name anything genuinely ambiguous that the recruiter should settle before screening starts. A description asking for "5+ years of React" and "10+ years of experience" is worth flagging rather than silently reconciling.`;

export async function generateCriteria(input: {
  jobDescription: string;
  preferences?: string;
}): Promise<JobCriteria> {
  const user = [
    `Job description:`,
    ``,
    input.jobDescription,
    input.preferences?.trim() &&
      [
        ``,
        `Additional hiring preferences from the recruiter. These are real requirements and rank alongside the description — but keep their sourceQuote attributed to this section rather than the description itself:`,
        ``,
        input.preferences.trim(),
      ].join("\n"),
    ``,
    `Produce the hiring criteria.`,
  ]
    .filter(Boolean)
    .join("\n");

  return structured({
    system: INSTRUCTIONS,
    user,
    schema: JobCriteriaSchema,
    // Runs once per job opening — worth the stronger model, since every
    // candidate score downstream inherits any mistake made here.
    model: env.geminiModel,
    temperature: 0.3,
  });
}
