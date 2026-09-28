import type { LeadRow } from "../db";

export const STANDARD_TEMPLATE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "title",
  "company_name",
  "company_domain",
  "linkedin_url",
] as const;

export function normalizeFieldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function customFields(lead: LeadRow): Record<string, string> {
  try {
    const parsed = JSON.parse(lead.raw) as Record<string, unknown>;
    const source =
      parsed && typeof parsed.custom_fields === "object" && parsed.custom_fields
        ? (parsed.custom_fields as Record<string, unknown>)
        : parsed;
    return Object.fromEntries(
      Object.entries(source ?? {}).map(([key, value]) => [
        normalizeFieldName(key),
        value == null ? "" : String(value),
      ]),
    );
  } catch {
    return {};
  }
}

export function fieldsForLead(lead: LeadRow): Record<string, string> {
  return {
    ...customFields(lead),
    first_name: lead.first_name,
    last_name: lead.last_name,
    full_name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    email: lead.email,
    title: lead.title,
    company_name: lead.company_name,
    company_domain: lead.company_domain,
    linkedin_url: lead.linkedin_url,
  };
}

export function renderTemplate(
  template: string,
  fields: Record<string, string>,
): { value: string; missing: string[] } {
  const missing = new Set<string>();
  const value = template.replace(/{{\s*([a-zA-Z0-9_. -]+)\s*}}/g, (_match, raw: string) => {
    const key = normalizeFieldName(raw);
    const replacement = fields[key]?.trim();
    if (!replacement) {
      missing.add(key);
      return `{{${key}}}`;
    }
    return replacement;
  });
  return { value, missing: [...missing] };
}
