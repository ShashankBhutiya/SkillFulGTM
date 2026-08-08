import { structured } from "../../gemini";
import { env } from "../../env";
import { ParsedResumeSchema, type ParsedResume } from "../schemas";

const INSTRUCTIONS = `You extract structured facts from a resume. You are not evaluating the candidate — a later step does that, and it can only be as good as this one.

The single rule: every field you fill must be supported by text that is actually in the resume. Resumes are terse and full of gaps, and the temptation is to close those gaps with what is usually true. Do not. A candidate who lists "Docker, Kubernetes, AWS" under Skills and never mentions them again has listed them under Skills — that is basis "listed_in_skills_section", not "used_in_role". The distinction carries real weight downstream, so draw it honestly.

sourceQuote must be text copied from the resume, not your summary of it. If you cannot copy a quote for a skill, do not emit the skill.

On dates and totals: compute totalYearsExperience by summing the role timeline. Where dates are missing, ambiguous, or overlapping in ways you cannot resolve, set experienceIsCalculable false and totalYearsExperience 0, then say what was unclear in missingInformation. A wrong number is worse here than an admitted unknown, because nothing downstream can tell that it was a guess.

Convert each role's dates to months as written. "2021-2023" with no months is 24. "Present" means now. If a role has no dates at all, months is 0.

missingInformation is the most useful field you produce — it drives the questions a human will actually ask. Be specific and resume-anchored: "Kubernetes listed under Skills with no supporting role or project", "No dates on the Acme role", "Says 'led migration' without saying team size or what was migrated". Not "could provide more detail".

employmentGaps: record gaps of six months or more between roles, as neutral date ranges. State the fact and nothing else. Do not speculate about causes, and do not characterise a gap as a concern — people take breaks for parenthood, illness, caregiving, study, and redundancy, and inferring anything from the gap itself is both unfair and, in many places, unlawful.

Ignore entirely, and never record: the candidate's name as a signal of anything, gender, age, graduation year as a proxy for age, nationality, marital status, photographs, and the prestige of any school or employer. Extract what they did, not who they are.`;

export async function parseResume(input: {
  resumeText: string;
  /** Row data from the recruiter's sheet — context only, never a substitute for the resume. */
  sheetHints?: { name?: string; currentCompany?: string; currentRole?: string };
}): Promise<ParsedResume> {
  const hints = input.sheetHints;
  const user = [
    hints?.name &&
      [
        `Context from the recruiter's spreadsheet. Use it only to disambiguate what the resume already says — never to fill a field the resume leaves empty:`,
        `- Name on file: ${hints.name}`,
        hints.currentCompany && `- Current company on file: ${hints.currentCompany}`,
        hints.currentRole && `- Current role on file: ${hints.currentRole}`,
        ``,
      ]
        .filter(Boolean)
        .join("\n"),
    `Resume text:`,
    ``,
    input.resumeText,
    ``,
    `Extract the structured facts.`,
  ]
    .filter(Boolean)
    .join("\n");

  return structured({
    system: INSTRUCTIONS,
    user,
    schema: ParsedResumeSchema,
    // The volume path — one call per candidate.
    model: env.geminiFastModel,
    // Extraction, not composition. Low temperature keeps quotes verbatim.
    temperature: 0.1,
  });
}
