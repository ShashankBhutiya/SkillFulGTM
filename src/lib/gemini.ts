import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "./env";

/**
 * The two agents differ by model, not by an effort dial (Gemini has none):
 *   - ICP generation runs once per company on the main model.
 *   - Drafting runs once per lead on the faster/cheaper model.
 * Both are set via GEMINI_MODEL / GEMINI_FAST_MODEL.
 */

/**
 * Round-robin over the configured keys. Gemini's per-key rate limits are low,
 * and drafting fans out one call per lead, so spreading calls across keys is
 * the difference between a 200-lead batch finishing and hitting 429s.
 */
let cursor = 0;
const clients = new Map<string, GoogleGenAI>();

function nextClient(): GoogleGenAI {
  const keys = env.geminiKeys;
  const key = keys[cursor % keys.length]!;
  cursor += 1;
  let client = clients.get(key);
  if (!client) {
    client = new GoogleGenAI({ apiKey: key });
    clients.set(key, client);
  }
  return client;
}

/**
 * Converts a Zod schema to the JSON Schema Gemini expects on `responseJsonSchema`.
 * Reused sub-schemas are inlined rather than emitted as `$ref`, which Gemini's
 * structured-output validator does not accept.
 */
function toResponseSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { reused: "inline" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

type StructuredArgs<T extends z.ZodType> = {
  system: string;
  user: string;
  schema: T;
  model: string;
  temperature?: number;
};

/**
 * One structured-output call. Gemini is constrained to emit JSON matching the
 * schema; the result is then re-validated with Zod so the returned value is
 * typed and trustworthy rather than merely shaped.
 */
/** True for errors that are worth retrying on a different key after a pause. */
function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|quota|rate|resource.?exhausted|503|overloaded|unavailable/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function structured<T extends z.ZodType>({
  system,
  user,
  schema,
  model,
  temperature = 0.7,
}: StructuredArgs<T>): Promise<z.infer<T>> {
  const responseJsonSchema = toResponseSchema(schema);

  // On a rate-limit / overload, back off and retry. nextClient() round-robins,
  // so each attempt uses a different key — a per-minute limit on one key does
  // not sink the whole request.
  const maxAttempts = Math.max(4, env.geminiKeys.length + 1);
  let response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await nextClient().models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          temperature,
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      });
      break;
    } catch (err) {
      if (attempt >= maxAttempts || !isTransient(err)) throw err;
      // 2s, 4s, 8s… with jitter, giving per-minute windows time to reset.
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 20000) + Math.random() * 500;
      await sleep(backoff);
    }
  }

  const text = response.text;
  if (!text || !text.trim()) {
    // Most often a safety block; surface the reason if the SDK provides one.
    const reason = response.promptFeedback?.blockReason;
    throw new Error(
      reason
        ? `Gemini returned no output (blocked: ${reason}).`
        : "Gemini returned no output for this request.",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned output that was not valid JSON.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Gemini output did not match the expected shape: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** Turns SDK/HTTP errors into something worth showing a user. */
export function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Config-not-set errors already say exactly what to do — pass them through.
  if (/^Missing (required )?environment variable|^Missing GEMINI_API_KEYS/i.test(msg)) {
    return msg;
  }
  if (/api key|API_KEY|permission|401|403/i.test(msg)) {
    return "Gemini rejected the API key. Check GEMINI_API_KEYS.";
  }
  if (/429|quota|rate/i.test(msg)) {
    return "Gemini rate limit or quota hit. Wait a moment, or add more keys to GEMINI_API_KEYS.";
  }
  return msg;
}
