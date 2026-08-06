"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Pill, Stat, Steps, card, input, label } from "./ui";

/** Initials bubble, tinted deterministically from the name so rows differ. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white/90"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 62% 58%), hsl(${(hue + 40) % 360} 58% 42%))`,
      }}
    >
      {initials || "?"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Types — declared locally so this client bundle never imports server modules  */
/* -------------------------------------------------------------------------- */

type Persona = {
  label: string;
  seniority: string;
  department: string;
  roleInDeal: string;
  painPoints: string[];
  valueProps: string[];
  objections: string[];
};

type Icp = {
  summary: string;
  reasoning: string;
  firmographics: {
    industries: string[];
    employeeMin: number;
    employeeMax: number;
    revenueBand: string;
    geographies: string[];
    technologies: string[];
  };
  personas: Persona[];
  triggerSignals: string[];
  disqualifiers: string[];
  sourcingQuery: {
    companySearchQueries: string[];
    targetSeniorities: string[];
    targetDepartments: string[];
    targetTitleKeywords: string[];
  };
};

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  email_status: string;
  company_name: string;
  company_domain: string;
  linkedin_url: string;
  selected: boolean;
};

type Draft = {
  id: string;
  lead_id: string;
  subject: string;
  body: string;
  basis: string;
  persona: string;
  confidence: string;
  approved: boolean;
};

type SendJob = {
  total: number;
  done: number;
  running: boolean;
  outcomes: { email: string; status: string; detail: string }[];
  error?: string;
};

type Config = {
  database: boolean;
  gemini: boolean;
  exa: boolean;
  hunter: boolean;
  smtp: boolean;
  compliance: boolean;
  publicBaseUrl: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/* -------------------------------------------------------------------------- */

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [config, setConfig] = useState<Config | null>(null);

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [icp, setIcp] = useState<Icp | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [job, setJob] = useState<SendJob | null>(null);

  const [form, setForm] = useState({
    name: "",
    website: "",
    productDescription: "",
    proofPoints: "",
    existingCustomers: "",
    pricing: "",
    notes: "",
  });
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    api<{ config: Config }>("/api/status")
      .then((d) => setConfig(d.config))
      .catch(() => setConfig(null));
  }, []);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  /* ---------------------------------------------------------------- step 1 */

  const generateIcp = () =>
    run("icp", async () => {
      const d = await api<{ campaignId: string; icp: Icp }>("/api/icp", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setCampaignId(d.campaignId);
      setIcp(d.icp);
      setStep(2);
    });

  /* ---------------------------------------------------------------- step 2 */

  const findLeads = () =>
    run("leads", async () => {
      await api("/api/icp", {
        method: "PATCH",
        body: JSON.stringify({ campaignId, icp }),
      });
      const d = await api<{ leads: Lead[]; totalAvailable: number; warnings: string[] }>(
        "/api/leads",
        { method: "POST", body: JSON.stringify({ campaignId, limit }) },
      );
      setLeads(d.leads);
      setWarnings(d.warnings ?? []);
      setStep(3);
    });

  /* ---------------------------------------------------------------- step 3 */

  const toggleLead = async (lead: Lead) => {
    const next = !lead.selected;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, selected: next } : l)));
    try {
      await api("/api/leads", {
        method: "PATCH",
        body: JSON.stringify({ leadId: lead.id, selected: Boolean(next) }),
      });
    } catch (err) {
      setLeads((ls) =>
        ls.map((l) => (l.id === lead.id ? { ...l, selected: lead.selected } : l)),
      );
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const writeDrafts = () =>
    run("drafts", async () => {
      const d = await api<{ drafts: Draft[]; failures: { lead: string; error: string }[] }>(
        "/api/drafts",
        { method: "POST", body: JSON.stringify({ campaignId }) },
      );
      setDrafts(d.drafts);
      setWarnings(
        d.failures.map((f) => `Could not draft for ${f.lead}: ${f.error}`),
      );
      setStep(4);
    });

  /* ---------------------------------------------------------------- step 4 */

  /** Local-only edit. Typing must not fire a request per keystroke. */
  const editDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  /** Persists the draft's current state — called on blur and on approve. */
  const persistDraft = async (id: string, patch: Partial<Draft> = {}) => {
    const current = drafts.find((d) => d.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    editDraft(id, patch);
    await api("/api/drafts", {
      method: "PATCH",
      body: JSON.stringify({
        draftId: id,
        subject: next.subject,
        body: next.body,
        approved: Boolean(next.approved),
      }),
    }).catch((err: Error) => setError(err.message));
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startSending = () =>
    run("send", async () => {
      await api("/api/send", { method: "POST", body: JSON.stringify({ campaignId }) });
      pollRef.current = setInterval(async () => {
        const d = await api<{ job: SendJob | null }>(`/api/send?campaignId=${campaignId}`);
        setJob(d.job);
        if (d.job && !d.job.running && pollRef.current) clearInterval(pollRef.current);
      }, 3000);
    });

  const approvedCount = drafts.filter((d) => d.approved).length;
  const selectedCount = leads.filter((l) => l.selected).length;
  const missing = config
    ? [
        !config.database && "DATABASE_URL",
        !config.gemini && "GEMINI_API_KEYS",
        !config.exa && "EXA_API_KEY",
        !config.hunter && "HUNTER_API_KEY",
        !config.smtp && "SMTP settings",
        !config.compliance && "UNSUBSCRIBE_SECRET / SENDER_POSTAL_ADDRESS",
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-5">
      <Steps current={step} />

      {missing.length > 0 && (
        <Alert tone="warn">
          Not configured yet: <b>{missing.join(", ")}</b>. Copy{" "}
          <code className="rounded bg-white/10 px-1">.env.example</code> to{" "}
          <code className="rounded bg-white/10 px-1">.env.local</code> and restart the dev
          server.
        </Alert>
      )}
      {config && !config.publicBaseUrl && (
        <Alert tone="error">
          <b>Unsubscribe links are unreachable.</b> <code className="rounded bg-white/10 px-1">APP_BASE_URL</code>{" "}
          points at localhost, so the opt-out link in every email would be dead — which
          is both a legal problem and a deliverability one. Sending is blocked until you
          set it to a public URL.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {warnings.map((w, i) => (
        <Alert key={i} tone="warn">
          {w}
        </Alert>
      ))}

      {/* ------------------------------------------------------------ step 1 */}
      {step === 1 && (
        <div className={card}>
          <h2 className="mb-4 text-lg font-medium">Tell us about your company</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Company name</label>
              <input
                className={input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Analytics"
              />
            </div>
            <div>
              <label className={label}>Website</label>
              <input
                className={input}
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="acme.com"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className={label}>
              What does the product do?{" "}
              <span className="font-normal text-[#9494a8]">
                — the whole ICP is derived from this, so be concrete
              </span>
            </label>
            <textarea
              className={`${input} h-32 resize-y`}
              value={form.productDescription}
              onChange={(e) => setForm({ ...form, productDescription: e.target.value })}
              placeholder="We plug into Snowflake and flag revenue-impacting data quality issues before they reach a dashboard. Setup is one SQL role and takes about ten minutes."
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Proof points</label>
              <textarea
                className={`${input} h-24 resize-y`}
                value={form.proofPoints}
                onChange={(e) => setForm({ ...form, proofPoints: e.target.value })}
                placeholder="Cut incident triage from 4h to 20m at Ramp. SOC 2 Type II."
              />
            </div>
            <div>
              <label className={label}>Customers you already have</label>
              <textarea
                className={`${input} h-24 resize-y`}
                value={form.existingCustomers}
                onChange={(e) => setForm({ ...form, existingCustomers: e.target.value })}
                placeholder="Ramp, Vanta, two Series B fintechs"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Pricing</label>
              <input
                className={input}
                value={form.pricing}
                onChange={(e) => setForm({ ...form, pricing: e.target.value })}
                placeholder="$1.5k/mo, annual"
              />
            </div>
            <div>
              <label className={label}>Anything else</label>
              <input
                className={input}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Avoid agencies; we lose those deals"
              />
            </div>
          </div>

          <div className="mt-5">
            <Button
              onClick={generateIcp}
              busy={busy === "icp"}
              disabled={busy !== null || form.productDescription.trim().length < 40}
            >
              {busy === "icp" ? "Thinking…" : "Generate ICP"}
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ step 2 */}
      {step === 2 && icp && (
        <div className="space-y-5">
          <div className={card}>
            <h2 className="mb-3 text-lg font-medium">Ideal customer profile</h2>
            <textarea
              className={`${input} h-24 resize-y`}
              value={icp.summary}
              onChange={(e) => setIcp({ ...icp, summary: e.target.value })}
            />
            <p className="mt-3 text-sm leading-relaxed text-[#9494a8]">
              <b>Why: </b>
              {icp.reasoning}
            </p>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Field k="Industries" v={icp.firmographics.industries.join(", ")} />
              <Field
                k="Headcount"
                v={`${icp.firmographics.employeeMin}–${icp.firmographics.employeeMax}`}
              />
              <Field k="Revenue" v={icp.firmographics.revenueBand} />
              <Field k="Geography" v={icp.firmographics.geographies.join(", ")} />
              <Field k="Tech signals" v={icp.firmographics.technologies.join(", ")} />
              <Field k="Triggers" v={icp.triggerSignals.join(" · ")} />
              <Field k="Disqualifiers" v={icp.disqualifiers.join(" · ")} />
            </div>
          </div>

          <div className={card}>
            <h3 className="mb-3 font-medium">Buying committee</h3>
            <div className="space-y-3">
              {icp.personas.map((p, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/8 bg-black/25 p-4 text-sm transition-colors hover:border-violet-400/25"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#edecf2]">{p.label}</span>
                    <Pill tone={p.roleInDeal === "economic_buyer" ? "good" : "neutral"}>
                      {p.roleInDeal.replace(/_/g, " ")}
                    </Pill>
                    <Pill tone="neutral">{p.department}</Pill>
                  </div>
                  <div className="mt-1.5 text-[#9494a8]">
                    <b>Pains: </b>
                    {p.painPoints.join("; ")}
                  </div>
                  <div className="mt-1 text-[#9494a8]">
                    <b>What lands: </b>
                    {p.valueProps.join("; ")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <h3 className="mb-1 font-medium">Sourcing plan</h3>
            <p className="mb-4 text-sm text-[#9494a8]">
              Exa runs these searches to find companies, then Hunter pulls the matching
              people at each one. Edit anything that looks off before spending credits.
            </p>
            <div className="space-y-3">
              <ListEdit
                title="Company searches (Exa)"
                values={icp.sourcingQuery.companySearchQueries}
                onChange={(v) =>
                  setIcp({
                    ...icp,
                    sourcingQuery: { ...icp.sourcingQuery, companySearchQueries: v },
                  })
                }
              />
              <ListEdit
                title="Title keywords (Hunter filter)"
                values={icp.sourcingQuery.targetTitleKeywords}
                onChange={(v) =>
                  setIcp({
                    ...icp,
                    sourcingQuery: { ...icp.sourcingQuery, targetTitleKeywords: v },
                  })
                }
              />
              <ListEdit
                title="Seniorities"
                values={icp.sourcingQuery.targetSeniorities}
                onChange={(v) =>
                  setIcp({
                    ...icp,
                    sourcingQuery: { ...icp.sourcingQuery, targetSeniorities: v },
                  })
                }
              />
              <ListEdit
                title="Departments"
                values={icp.sourcingQuery.targetDepartments}
                onChange={(v) =>
                  setIcp({
                    ...icp,
                    sourcingQuery: { ...icp.sourcingQuery, targetDepartments: v },
                  })
                }
              />
            </div>

            <div className="mt-5 flex items-center gap-3">
              <label className="text-sm">How many leads</label>
              <input
                type="number"
                min={1}
                max={200}
                className={`${input} w-24`}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
              <Button onClick={findLeads} busy={busy === "leads"} disabled={busy !== null}>
                {busy === "leads" ? "Finding companies + contacts…" : "Find leads"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ step 3 */}
      {step === 3 && (
        <div className={`${card} sk-rise`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Matched people</h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-[#9494a8]">
                <span className="font-medium text-[#d7d6e3]">{leads.length}</span> found
                <span className="text-[#3a3a50]">·</span>
                <span className="font-medium text-[#9d85ff]">{selectedCount}</span> selected
              </div>
            </div>
            <Button
              onClick={writeDrafts}
              busy={busy === "drafts"}
              disabled={busy !== null || selectedCount === 0}
            >
              {busy === "drafts" ? `Writing ${selectedCount} emails…` : "Write emails"}
            </Button>
          </div>

          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-white/8 bg-black/25 text-left">
                  <th className="w-10 py-2.5 pl-6" />
                  <th className="sk-eyebrow py-2.5 pr-3 font-semibold">Name</th>
                  <th className="sk-eyebrow py-2.5 pr-3 font-semibold">Title</th>
                  <th className="sk-eyebrow py-2.5 pr-3 font-semibold">Company</th>
                  <th className="sk-eyebrow py-2.5 pr-6 font-semibold">Email</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => l.email && toggleLead(l)}
                    className={`border-b border-white/6 transition-colors last:border-0 ${
                      l.email ? "cursor-pointer hover:bg-white/4" : "opacity-55"
                    } ${l.selected ? "bg-violet-500/6" : ""}`}
                  >
                    <td className="py-2.5 pl-6">
                      <input
                        type="checkbox"
                        checked={Boolean(l.selected)}
                        disabled={!l.email}
                        onChange={() => toggleLead(l)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 accent-violet-500"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${l.first_name} ${l.last_name}`} />
                        <span className="font-medium text-[#edecf2]">
                          {l.first_name} {l.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[15rem] truncate py-2.5 pr-3 text-[#9494a8]">
                      {l.title}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-[#b9b8c9]">{l.company_name}</span>
                      {l.company_domain && (
                        <span className="ml-1.5 text-xs text-[#5c5c74]">
                          {l.company_domain}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-6">
                      {l.email ? (
                        <span className="font-mono text-xs text-[#9494a8]">{l.email}</span>
                      ) : (
                        <Pill tone="warn">no address</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {leads.length === 0 && (
            <div className="py-10 text-center text-sm text-[#61617a]">
              No leads yet — go back and run the sourcing step.
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ step 4 */}
      {step === 4 && (
        <div className="space-y-5">
          <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <div className="font-medium">
                {approvedCount} of {drafts.length} approved
              </div>
              <p className="text-sm text-[#9494a8]">
                Only approved emails send. Nothing leaves your mailbox until you press the
                button.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => drafts.forEach((d) => persistDraft(d.id, { approved: true }))}
                disabled={busy !== null || drafts.length === 0}
              >
                Approve all
              </Button>
              <Button
                onClick={startSending}
                busy={busy === "send" || Boolean(job?.running)}
                disabled={busy !== null || approvedCount === 0 || Boolean(job?.running)}
              >
                {job?.running ? "Sending…" : `Send ${approvedCount}`}
              </Button>
            </div>
          </div>

          {job && (
            <Alert tone={job.error ? "error" : "info"}>
              <div className="font-medium">
                {job.done} / {job.total} processed {job.running ? "— in progress" : "— finished"}
              </div>
              {job.error && <div className="mt-1">{job.error}</div>}
              <ul className="mt-2 space-y-0.5">
                {job.outcomes.slice(-8).map((o, i) => (
                  <li key={i}>
                    <span
                      className={
                        o.status === "sent"
                          ? "text-emerald-400"
                          : o.status === "failed"
                            ? "text-rose-400"
                            : "text-[#9494a8]"
                      }
                    >
                      {o.status}
                    </span>{" "}
                    {o.email} {o.detail}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="space-y-4">
            {drafts.map((d) => {
              const lead = leads.find((l) => l.id === d.lead_id);
              return (
                <div
                  key={d.id}
                  className={`${card} sk-rise transition-colors ${
                    d.approved ? "border-emerald-400/25" : ""
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        name={lead ? `${lead.first_name} ${lead.last_name}` : d.lead_id}
                      />
                      <div className="min-w-0 text-sm">
                        <div className="font-medium text-[#edecf2]">
                          {lead ? `${lead.first_name} ${lead.last_name}` : d.lead_id}
                          {lead && (
                            <span className="font-normal text-[#9494a8]">
                              {" "}
                              · {lead.title}
                            </span>
                          )}
                        </div>
                        <div className="truncate font-mono text-xs text-[#61617a]">
                          {lead?.email}
                        </div>
                      </div>
                    </div>

                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        d.approved
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border-white/10 text-[#9494a8] hover:border-white/20 hover:text-[#d7d6e3]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(d.approved)}
                        onChange={() => persistDraft(d.id, { approved: !d.approved })}
                        className="size-4 accent-emerald-500"
                      />
                      {d.approved ? "Approved" : "Approve"}
                    </label>
                  </div>

                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="sk-eyebrow w-14 shrink-0">Subject</span>
                    <input
                      className={`${input} font-medium`}
                      value={d.subject}
                      onChange={(e) => editDraft(d.id, { subject: e.target.value })}
                      onBlur={() => persistDraft(d.id)}
                    />
                  </div>
                  <textarea
                    className={`${input} h-44 resize-y leading-relaxed`}
                    value={d.body}
                    onChange={(e) => editDraft(d.id, { body: e.target.value })}
                    onBlur={() => persistDraft(d.id)}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#61617a]">
                    <Pill
                      tone={
                        d.confidence === "high"
                          ? "good"
                          : d.confidence === "medium"
                            ? "warn"
                            : "bad"
                      }
                    >
                      {d.confidence} confidence
                    </Pill>
                    <Pill tone="neutral">{d.persona}</Pill>
                    <span className="min-w-0 flex-1 truncate" title={d.basis}>
                      on: {d.basis}
                    </span>
                    <span className="tabular-nums text-[#4a4a5e]">
                      {d.body.trim().split(/\s+/).filter(Boolean).length}w
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return <Stat label={k} value={v} />;
}

function ListEdit({
  title,
  values,
  onChange,
}: {
  title: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <label className={label}>
        {title} <span className="font-normal text-[#9494a8]">— comma separated</span>
      </label>
      <input
        className={input}
        value={values.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}
