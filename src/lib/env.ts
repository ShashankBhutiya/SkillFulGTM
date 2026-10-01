/** Typed access to environment config, with loud failures at the call site. */

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v.trim();
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v || !v.trim()) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function maybe(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Splits a comma/whitespace/newline separated list, dropping blanks. */
function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  get googleOAuth() {
    return { clientId: req("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: req("GOOGLE_OAUTH_CLIENT_SECRET"), redirectUri: `${this.baseUrl.replace(/\/$/, "")}/api/account/google/callback` };
  },
  get credentialsEncryptionKey() {
    return req("CREDENTIALS_ENCRYPTION_KEY");
  },
  get authMail() {
    const port = num("AUTH_SMTP_PORT", 587);
    return {
      host: maybe("AUTH_SMTP_HOST"),
      port,
      secure: port === 465,
      user: maybe("AUTH_SMTP_USER"),
      pass: maybe("AUTH_SMTP_PASS"),
      from: maybe("AUTH_SMTP_FROM"),
    };
  },
  /** One or more Gemini keys. Multiple keys are round-robined to spread quota. */
  get geminiKeys() {
    const keys = list("GEMINI_API_KEYS");
    if (!keys.length) {
      throw new Error(
        "Missing GEMINI_API_KEYS. Add at least one key (comma-separated for several).",
      );
    }
    return keys;
  },
  get geminiModel() {
    return opt("GEMINI_MODEL", "gemini-flash-latest");
  },
  get geminiFastModel() {
    return opt("GEMINI_FAST_MODEL", "gemini-3.5-flash-lite");
  },

  /**
   * Postgres connection string.
   *
   * Managed integrations (Neon, Supabase, Vercel Postgres) inject several names
   * at once, and picking the wrong one is a production-only failure: a direct
   * connection works fine locally, then exhausts the server's connection limit
   * once serverless starts running many instances of it. So prefer a URL that
   * is demonstrably pooled, and only fall back to a direct one if that is all
   * that exists.
   */
  get databaseUrl() {
    const names = [
      "DATABASE_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
      "POSTGRES_URL_NON_POOLING",
    ];
    const found = names
      .map((n) => [n, process.env[n]?.trim()] as const)
      .filter((e): e is readonly [string, string] => Boolean(e[1]));

    if (!found.length) {
      throw new Error(
        "No Postgres connection string. Set DATABASE_URL (use the pooled URL — Neon's '-pooler' host, or Supabase port 6543).",
      );
    }

    const pooled = found.find(
      ([name, url]) =>
        name !== "POSTGRES_URL_NON_POOLING" &&
        (/-pooler\./.test(url) || /pgbouncer=true/.test(url) || /:6543\//.test(url)),
    );
    return (pooled ?? found[0]!)[1];
  },

  get webSearchProvider() {
    return opt("WEB_SEARCH_PROVIDER", "exa");
  },
  get exaKey() {
    return req("EXA_API_KEY");
  },
  get hunterKey() {
    return req("HUNTER_API_KEY");
  },

  get baseUrl() {
    return opt("APP_BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
  },
  get unsubscribeSecret() {
    return req("UNSUBSCRIBE_SECRET");
  },

  /**
   * True when APP_BASE_URL points somewhere only this machine can reach. Every
   * unsubscribe link is built from it, so sending real mail with a local base
   * URL ships a legally-required opt-out that no recipient can ever open.
   */
  get baseUrlIsLocal() {
    const host = (() => {
      try {
        return new URL(this.baseUrl).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    return (
      !host ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  },

  /**
   * Whether to mail addresses the verifier could not confirm (accept-all
   * domains). Off by default: these are the ones that bounce after a clean
   * handoff, and a young domain cannot absorb that.
   */
  get sendToRiskyAddresses() {
    return /^(1|true|yes)$/i.test(process.env.SEND_TO_RISKY_ADDRESSES?.trim() ?? "");
  },

};

/** Reports which settings are missing without throwing — used by the UI banner. */
export function configStatus() {
  const check = (name: string) => Boolean(process.env[name]?.trim());

  // Resolved through the same preference rules used to connect, so this
  // reports what the app will actually do — never the credential itself.
  let database = false;
  let databasePooled = false;
  try {
    const url = env.databaseUrl;
    database = true;
    databasePooled =
      /-pooler\./.test(url) || /pgbouncer=true/.test(url) || /:6543\//.test(url);
  } catch {
    database = false;
  }

  return {
    database,
    databasePooled,
    credentialsEncryption: check("CREDENTIALS_ENCRYPTION_KEY"),
    gemini: check("GEMINI_API_KEYS"),
    exa: check("EXA_API_KEY"),
    hunter: check("HUNTER_API_KEY"),
    smtp: false,
    compliance: check("UNSUBSCRIBE_SECRET"),
    // Reported separately: everything else can be set and this still blocks sending.
    publicBaseUrl: !env.baseUrlIsLocal,
  };
}
