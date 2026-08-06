import { structured } from "../gemini";
import { env } from "../env";
import { DraftSchema, type CompanyInput, type Draft, type Icp } from "../schemas";
import type { LeadRow } from "../db";

/** Fixed guidance, identical for every campaign and every lead. */
const INSTRUCTIONS = `You write cold outreach emails, one recipient at a time. You are given the sender's company, the ideal customer profile, and one lead. You return a single email.

Structure — 3 to 4 short paragraphs, 90 to 160 words total:
1. The reason you are writing to THIS person, built on a specific fact from their company data. Not the sender's pitch, not a compliment — the observation that made them worth writing to.
2. The problem that fact implies for someone in their role. Name it in their language, concretely enough that they recognise their own week in it.
3. What the sender does about it, in one or two sentences, tied back to the problem you just named. Cite a proof point only if one was supplied.
4. The ask: a reply, not a meeting. "Worth a look?" outperforms "do you have 15 minutes Thursday?".

Do not pad to reach the word count. If you genuinely have nothing specific to say, a shorter honest email beats a longer padded one — but with a company summary in the lead data you almost always have something.

The subject line does real work. It must reference the specific thing the email is about — the detail you opened on, or the problem you named. Three to seven lowercase words, no punctuation. "outbound for acme" is a failure: it is the template, not a subject. So is anything that merely restates the sender's product category. Write the subject last, after the body, so it can point at what the email actually says.

Write the way a person emails a stranger they respect: direct, specific, no performance.

What kills them:
- "I hope this email finds you well". "I wanted to reach out". "I came across your profile". Any sentence that could open any email to anyone.
- Flattery the sender has not earned, and inferred praise about the recipient's work that you cannot actually verify.
- Stacked adjectives, "revolutionary", "game-changing", "seamless", "leverage", "synergy", em-dash-heavy corporate rhythm.
- Fake familiarity: "Saw you're crushing it", "Loved your post" when no post is in the data.

The honesty rule, and it overrides everything above: personalize only from facts present in the lead data you were given. You have no web access and no LinkedIn feed beyond what is in that block. Inventing a detail is worse than sending a plainer email, because the recipient can tell, and it is the sender's real name and domain on the message.

Most leads include an "About their company" summary read from the company's own website. That is your primary personalization material — use it. Open on something specific from it: what they build, who they sell to, the stage they are at. Do not merely restate it back to them ("I see you build X") — draw the consequence for the person's role.

Set confidence honestly, and rate the personalization, not the email:
- "high" — you opened on a specific fact about this company and the problem you named follows from it.
- "medium" — you used the company summary but only in a general way, or the summary was thin.
- "low" — you had nothing but a job title and a domain. Write a clean role-based email and say so in personalizationBasis.

personalizationBasis names the exact fact you used and where it came from, e.g. "company summary: builds canary tokens for cloud intrusion detection, sells to security teams".

Do not write a greeting line, a sign-off, a signature, or any unsubscribe text. The system appends those. Start with the first sentence of the body.`;

/** Per-campaign context: the sender and who they're targeting. */
function campaignContext(company: CompanyInput, icp: Icp): string {
  return `## The sender

Company: ${company.name}${company.website ? ` (${company.website})` : ""}

What they sell:
${company.productDescription}
${company.proofPoints ? `\nProof points that can be cited (only these — do not invent numbers):\n${company.proofPoints}` : ""}
${company.existingCustomers ? `\nExisting customers that can be name-dropped:\n${company.existingCustomers}` : ""}

## Who they are targeting

${icp.summary}

Personas:
${icp.personas
  .map(
    (p) =>
      `- ${p.label} (${p.roleInDeal.replace(/_/g, " ")})\n` +
      `    pains: ${p.painPoints.join("; ")}\n` +
      `    what lands: ${p.valueProps.join("; ")}\n` +
      `    pushback: ${p.objections.join("; ")}`,
  )
  .join("\n")}

Buying signals worth referencing if visible in the lead data:
${icp.triggerSignals.map((s) => `- ${s}`).join("\n")}`;
}

function leadBlock(lead: LeadRow): string {
  const raw = safeParse(lead.raw);
  const extras: string[] = [];
  if (raw.department) extras.push(`Department: ${raw.department}`);
  if (raw.seniority) extras.push(`Seniority: ${raw.seniority}`);

  return `Name: ${lead.first_name} ${lead.last_name}`.trim() +
    `\nTitle: ${lead.title || "unknown"}` +
    `\nCompany: ${lead.company_name}${lead.company_domain ? ` (${lead.company_domain})` : ""}` +
    (lead.company_blurb
      ? `\nAbout their company (from their own website): ${lead.company_blurb}`
      : `\nAbout their company: not available — personalize from role only, and set confidence to "low".`) +
    (lead.linkedin_url ? `\nLinkedIn: ${lead.linkedin_url}` : "") +
    (extras.length ? `\n${extras.join("\n")}` : "") +
    `\n\nThis is everything known about this lead. Write the email.`;
}

type RawLead = {
  department?: string;
  seniority?: string;
  confidence?: number;
};

function safeParse(json: string): RawLead {
  try {
    return JSON.parse(json) as RawLead;
  } catch {
    return {};
  }
}

export async function draftEmail(
  company: CompanyInput,
  icp: Icp,
  lead: LeadRow,
): Promise<Draft> {
  // Fixed guidance + per-campaign context form the system instruction; the lead
  // is the user turn.
  const system = `${INSTRUCTIONS}\n\n${campaignContext(company, icp)}`;

  return structured({
    system,
    user: leadBlock(lead),
    schema: DraftSchema,
    // Drafting runs once per lead — use the faster/cheaper model.
    model: env.geminiFastModel,
    temperature: 0.8,
  });
}
