import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Resume bytes → plain text.
 *
 * This runs before any model call, and it is the only part of the pipeline
 * with a hard latency budget worth defending: extraction is local CPU, so if
 * it stays in the low hundreds of milliseconds the whole per-resume budget is
 * effectively one Gemini call. Everything here is chosen with that in mind —
 * no OCR pass, no layout reconstruction, no image handling.
 */

/** Anything larger is a scan or a portfolio, not a resume the parser can use. */
const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export type ExtractedText = {
  text: string;
  /** What the bytes actually were, decided by magic number rather than extension. */
  format: "pdf" | "docx" | "text";
  bytes: number;
  ms: number;
};

export class ExtractionError extends Error {}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Share links from Drive and Dropbox serve an HTML preview page to a plain
 * GET, so fetching one yields a few kilobytes of markup that parse as an empty
 * resume. Rewriting them to their direct-download form is the difference
 * between a working import and a column of silent blanks.
 */
export function normalizeResumeUrl(raw: string): string {
  const url = raw.trim();

  const drive =
    /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url) ??
    /drive\.google\.com\/open\?id=([\w-]+)/.exec(url);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;

  const docs = /docs\.google\.com\/document\/d\/([\w-]+)/.exec(url);
  if (docs) return `https://docs.google.com/document/d/${docs[1]}/export?format=pdf`;

  if (/dropbox\.com\//.test(url)) {
    return url.replace(/[?&]dl=0\b/, "").replace(/$/, url.includes("?") ? "&dl=1" : "?dl=1");
  }

  return url;
}

/**
 * Blocks obviously-internal targets before fetching.
 *
 * Resume links arrive from a spreadsheet, which is user-supplied data rather
 * than something the recruiter typed deliberately — a row pointing at
 * `http://169.254.169.254/` would otherwise make the server fetch its own
 * cloud credentials. This checks the literal host only; a hostname that
 * resolves to a private address still gets through, so treat it as a guard
 * against accidents and cheap probes, not a complete SSRF defence.
 */
function assertFetchable(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ExtractionError(`Unsupported link protocol: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    /^fe80:/i.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host);

  if (blocked) {
    throw new ExtractionError(
      `Refusing to fetch an internal address (${url.hostname}). Resume links must be publicly reachable.`,
    );
  }
}

export async function fetchResume(link: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(normalizeResumeUrl(link));
  } catch {
    throw new ExtractionError(`Not a valid URL: ${link}`);
  }
  assertFetchable(url);

  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Some hosts serve a login wall to clients without a browser-ish UA.
    headers: { "user-agent": "Mozilla/5.0 (compatible; SkillfulRecruit/1.0)" },
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExtractionError(
      /timeout|abort/i.test(msg) ? `Timed out fetching ${url.hostname}` : `Could not fetch: ${msg}`,
    );
  });

  if (!res.ok) {
    throw new ExtractionError(
      res.status === 403 || res.status === 401
        ? `${url.hostname} returned ${res.status} — the link is probably not shared publicly.`
        : `${url.hostname} returned ${res.status}.`,
    );
  }

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    throw new ExtractionError(`File is ${Math.round(declared / 1e6)}MB — too large to process.`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new ExtractionError(`File is ${Math.round(buf.byteLength / 1e6)}MB — too large to process.`);
  }
  return buf;
}

export async function readLocalResume(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExtractionError(`Could not read ${path}: ${msg}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                  */
/* -------------------------------------------------------------------------- */

function sniff(buf: Buffer): "pdf" | "docx" | "text" {
  // Extensions lie, especially in a column a recruiter pasted by hand.
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  // DOCX is a zip. So is a lot else, but nothing else we accept.
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05)) return "docx";
  return "text";
}

/**
 * Collapses the whitespace PDF extraction leaves behind. Resume layouts are
 * table- and column-heavy, so raw output is full of runs of spaces and blank
 * lines that cost tokens and, at volume, actively degrade parsing.
 */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeText(buf: Buffer): Promise<ExtractedText> {
  const started = Date.now();
  const format = sniff(buf);

  let text: string;
  try {
    if (format === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } else if (format === "docx") {
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else {
      text = buf.toString("utf8");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExtractionError(`Could not read this ${format.toUpperCase()}: ${msg}`);
  }

  text = tidy(text);

  if (text.length < 120) {
    // Near-empty output from a file with real bytes in it means a scanned
    // image or a share page rather than a document. Saying which saves the
    // recruiter from re-uploading the same unreadable file.
    throw new ExtractionError(
      format === "pdf"
        ? "This PDF has almost no extractable text — it is probably a scan. OCR it first, or attach a text-based copy."
        : format === "text" && /^\s*<(!doctype|html)/i.test(buf.toString("utf8").slice(0, 200))
          ? "That link returned a web page, not a file. Use a direct download link."
          : "This file contains almost no readable text.",
    );
  }

  return { text, format, bytes: buf.byteLength, ms: Date.now() - started };
}

/** Fetch-or-read plus extract. `source` is a URL or a local filesystem path. */
export async function loadResume(source: string): Promise<ExtractedText> {
  const isUrl = /^https?:\/\//i.test(source.trim());
  const buf = isUrl ? await fetchResume(source) : await readLocalResume(source);
  return extractResumeText(buf);
}
