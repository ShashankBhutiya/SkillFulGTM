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

  /** Postgres connection string. Use the pooled URL on serverless hosts. */
  get databaseUrl() {
    return req("DATABASE_URL");
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

  get smtp() {
    const port = num("SMTP_PORT", 587);
    return {
      host: req("SMTP_HOST"),
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      user: req("SMTP_USER"),
      pass: req("SMTP_PASS"),
      fromName: opt("SMTP_FROM_NAME", ""),
      from: req("SMTP_FROM"),
      replyTo: opt("SMTP_REPLY_TO", ""),
    };
  },

  get baseUrl() {
    return opt("APP_BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
  },
  get unsubscribeSecret() {
    return req("UNSUBSCRIBE_SECRET");
  },
  get postalAddress() {
    return req("SENDER_POSTAL_ADDRESS");
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

  get maxSendsPerDay() {
    return num("MAX_SENDS_PER_DAY", 40);
  },
  get secondsBetweenSends() {
    return num("SECONDS_BETWEEN_SENDS", 45);
  },
};

/** Reports which settings are missing without throwing — used by the UI banner. */
export function configStatus() {
  const check = (name: string) => Boolean(process.env[name]?.trim());
  return {
    database: check("DATABASE_URL"),
    gemini: check("GEMINI_API_KEYS"),
    exa: check("EXA_API_KEY"),
    hunter: check("HUNTER_API_KEY"),
    smtp:
      check("SMTP_HOST") && check("SMTP_USER") && check("SMTP_PASS") && check("SMTP_FROM"),
    compliance: check("UNSUBSCRIBE_SECRET") && check("SENDER_POSTAL_ADDRESS"),
    // Reported separately: everything else can be set and this still blocks sending.
    publicBaseUrl: !env.baseUrlIsLocal,
  };
}
