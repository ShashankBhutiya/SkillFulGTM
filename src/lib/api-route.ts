import { NextResponse } from "next/server";
import { hasValidOrigin } from "./auth";

/** Keep API failures readable by clients, including malformed JSON and unavailable services. */
export function apiRoute<Context>(handler: (req: Request, context: Context) => Promise<Response>) {
  return async (req: Request, context: Context): Promise<Response> => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !(await hasValidOrigin(req))) {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      }
      return await handler(req, context);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid request. Send a valid JSON object." }, { status: 400 });
      }
      const code = (error as { code?: string })?.code;
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("Missing required environment variable")) {
        return NextResponse.json({ error: "A required server setting is missing. Check the server configuration." }, { status: 503 });
      }
      if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "57P01", "53300"].includes(code ?? "")) {
        return NextResponse.json({ error: "A required service is temporarily unavailable. Please try again." }, { status: 503 });
      }
      return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
    }
  };
}

export async function jsonObject(req: Request): Promise<Record<string, unknown>> {
  const value: unknown = await req.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}
