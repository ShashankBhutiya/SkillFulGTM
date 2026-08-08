import ExcelJS from "exceljs";
import Papa from "papaparse";
import { CandidateRowSchema, type CandidateRow } from "./schemas";

/**
 * Spreadsheet → candidate rows.
 *
 * The spreadsheet is the recruiter's, not ours, so this bends to whatever they
 * already have rather than demanding an exact template. Headers are matched by
 * alias, and a row that fails to parse is reported with its line number instead
 * of failing the import — one malformed row out of two hundred should not cost
 * the other hundred and ninety-nine.
 */

const ALIASES: Record<keyof CandidateRow, string[]> = {
  name: ["candidatename", "name", "fullname", "candidate"],
  resumeLink: ["resumelink", "resume", "cv", "resumeurl", "cvlink", "cvurl", "resumefile"],
  email: ["email", "emailaddress", "mail", "candidateemail"],
  phone: ["phone", "phonenumber", "mobile", "contact", "contactnumber"],
  currentCompany: ["currentcompany", "company", "employer", "organisation", "organization"],
  currentRole: ["currentrole", "role", "title", "jobtitle", "designation", "currenttitle", "position"],
  experience: ["experience", "yearsofexperience", "exp", "yoe", "totalexperience"],
  location: ["location", "city", "basedin", "currentlocation"],
  notes: ["notes", "comments", "remarks", "recruiternotes"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Maps the sheet's actual headers onto our field names. */
function buildHeaderMap(headers: string[]): {
  map: Map<number, keyof CandidateRow>;
  unmatched: string[];
} {
  const map = new Map<number, keyof CandidateRow>();
  const claimed = new Set<keyof CandidateRow>();
  const unmatched: string[] = [];

  headers.forEach((header, i) => {
    const h = norm(header);
    if (!h) return;
    const field = (Object.keys(ALIASES) as (keyof CandidateRow)[]).find(
      (f) => !claimed.has(f) && ALIASES[f].includes(h),
    );
    if (field) {
      map.set(i, field);
      claimed.add(field);
    } else {
      unmatched.push(header);
    }
  });

  return { map, unmatched };
}

export type ImportResult = {
  rows: CandidateRow[];
  /** Rows that could not be used, with the sheet line number so they're findable. */
  skipped: { line: number; reason: string }[];
  /** Headers we did not recognise — surfaced so a renamed column is visible, not silent. */
  unmatchedHeaders: string[];
  matchedFields: (keyof CandidateRow)[];
};

function toRows(table: string[][]): ImportResult {
  const [headerRow, ...body] = table;
  if (!headerRow?.length) {
    throw new Error("That file has no header row.");
  }

  const { map, unmatched } = buildHeaderMap(headerRow);
  if (!Array.from(map.values()).includes("name")) {
    throw new Error(
      `No candidate name column found. Expected one of: ${ALIASES.name.join(", ")}. Found: ${headerRow.filter(Boolean).join(", ")}`,
    );
  }

  const rows: CandidateRow[] = [];
  const skipped: ImportResult["skipped"] = [];

  body.forEach((cells, i) => {
    const line = i + 2; // 1-based, plus the header
    if (!cells.some((c) => c?.trim())) return; // blank spacer row

    const draft: Record<string, string> = {};
    map.forEach((field, col) => {
      draft[field] = (cells[col] ?? "").trim();
    });

    const parsed = CandidateRowSchema.safeParse(draft);
    if (!parsed.success) {
      skipped.push({
        line,
        reason: parsed.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`).join("; "),
      });
      return;
    }
    rows.push(parsed.data);
  });

  return {
    rows,
    skipped,
    unmatchedHeaders: unmatched,
    matchedFields: Array.from(new Set(map.values())),
  };
}

function parseCsv(text: string): string[][] {
  const out = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: false,
  });
  return out.data.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("That workbook has no sheets.");

  const table: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    // `row.values` is 1-indexed with a leading hole, so read by column index.
    for (let c = 1; c <= ws.columnCount; c++) {
      cells.push(cellText(row.getCell(c).value));
    }
    table.push(cells);
  });
  return table;
}

/**
 * ExcelJS cell values are a union — a hyperlinked resume cell is an object
 * whose display text is the candidate's name and whose `hyperlink` is the
 * actual link. Reaching for the link first is what makes those columns work.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.hyperlink === "string") return v.hyperlink;
    if (typeof v.text === "string") return v.text;
    if (typeof v.result === "string" || typeof v.result === "number") return String(v.result);
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((p) => p.text ?? "").join("");
    }
  }
  return "";
}

/** Entry point. Sniffs the format from the bytes rather than the filename. */
export async function importCandidates(buf: Buffer, filename = ""): Promise<ImportResult> {
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip || /\.xlsx?$/i.test(filename)) {
    return toRows(await parseXlsx(buf));
  }
  return toRows(parseCsv(buf.toString("utf8")));
}
