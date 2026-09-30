"use client";

import Papa from "papaparse";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Pill, card, input, label } from "./ui";

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

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

type Preview = {
  leadId: string;
  email: string;
  name: string;
  subject: string;
  body: string;
  missing: string[];
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
  databasePooled: boolean;
  credentialsEncryption: boolean;
  smtp: boolean;
  compliance: boolean;
  publicBaseUrl: boolean;
};

type ManualColumn = {
  id: string;
  name: string;
  values: string;
  locked?: boolean;
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

const standardFields = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "title",
  "company_name",
  "company_domain",
  "linkedin_url",
];

function BulkSteps({ current }: { current: number }) {
  const names = ["Campaign", "Recipients", "Template", "Review & send"];
  return (
    <ol className="flex flex-1 items-center">
      {names.map((name, index) => {
        const n = index + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={name} className={index < names.length - 1 ? "flex flex-1 items-center" : "flex items-center"}>
            <div className="flex items-center gap-2">
              <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                  : active
                    ? "bg-violet-500 text-white ring-1 ring-violet-300/40"
                    : "text-[#5c5c74] ring-1 ring-white/10"
              }`}>{done ? "✓" : n}</span>
              <span className={`hidden text-sm md:block ${active ? "text-white" : "text-[#77778c]"}`}>{name}</span>
            </div>
            {index < names.length - 1 && <div className={`mx-3 h-px flex-1 ${done ? "bg-emerald-400/50" : "bg-white/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function BulkEmail({
  onSwitchToAi,
  config,
  initialCampaignId = null,
  initialLeads = [],
}: {
  onSwitchToAi: (leads: Lead[]) => void;
  config: Config | null;
  initialCampaignId?: string | null;
  initialLeads?: Lead[];
}) {
  const [stage, setStage] = useState(initialCampaignId ? 3 : 1);
  const [campaignName, setCampaignName] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId);
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [fields, setFields] = useState<string[]>(standardFields);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [job, setJob] = useState<SendJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [recipientInputMode, setRecipientInputMode] = useState<"csv" | "columns">("csv");
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [manualColumns, setManualColumns] = useState<ManualColumn[]>([
    { id: "email", name: "email", values: "", locked: true },
    { id: "first_name", name: "first_name", values: "", locked: true },
    { id: "last_name", name: "last_name", values: "", locked: true },
    { id: "company_name", name: "company_name", values: "", locked: true },
    { id: "title", name: "title", values: "", locked: true },
  ]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (config?.database) {
      api<{ templates: Template[] }>("/api/templates")
        .then((data) => setTemplates(data.templates))
        .catch((err: Error) => setError(err.message));
    }
    try {
      setTestEmail(localStorage.getItem("sk_test_email") ?? "");
    } catch {}
  }, [config?.database]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const startCampaign = () => run("campaign", async () => {
    const data = await api<{ campaignId: string }>("/api/bulk/campaign", {
      method: "POST",
      body: JSON.stringify({ name: campaignName }),
    });
    setCampaignId(data.campaignId);
    setStage(2);
  });

  const submitRecipientRows = async (
    rows: Record<string, string>[],
    rowOffset: number,
  ) => {
      const data = await api<{
        leads: Lead[];
        imported: number;
        suppressed: number;
        rejected: { row: number; reason: string }[];
        fields: string[];
      }>("/api/leads/import", {
        method: "POST",
        body: JSON.stringify({ campaignId, rows, mode: importMode, rowOffset }),
      });
      setLeads(data.leads);
      setFields((current) => [...new Set([...standardFields, ...current, ...data.fields])]);
      const notes = [`Imported ${data.imported} recipient${data.imported === 1 ? "" : "s"}.`];
      if (data.suppressed) notes.push(`${data.suppressed} suppressed address${data.suppressed === 1 ? " was" : "es were"} left unselected.`);
      if (data.rejected.length) notes.push(`${data.rejected.length} invalid or duplicate row${data.rejected.length === 1 ? " was" : "s were"} skipped.`);
      setNotice(notes.join(" "));
  };

  const importCsv = (file?: File) => {
    if (!file || !campaignId) return;
    run("import", async () => {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim(),
      });
      if (parsed.errors.length) {
        throw new Error(`CSV error on row ${parsed.errors[0]!.row ?? "unknown"}: ${parsed.errors[0]!.message}`);
      }
      await submitRecipientRows(parsed.data, 2);
    });
  };

  const columnLines = (value: string) => {
    const lines = value.replace(/\r/g, "").split("\n");
    while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
    return lines;
  };

  const manualRowCount = Math.max(0, ...manualColumns.map((column) => columnLines(column.values).length));

  const addManualColumn = () => {
    const id = `custom_${Date.now()}`;
    setManualColumns((columns) => [...columns, { id, name: "custom_field", values: "" }]);
  };

  const updateManualColumn = (id: string, patch: Partial<ManualColumn>) =>
    setManualColumns((columns) => columns.map((column) => column.id === id ? { ...column, ...patch } : column));

  const removeManualColumn = (id: string) =>
    setManualColumns((columns) => columns.filter((column) => column.id !== id));

  const importManualColumns = () => run("import-columns", async () => {
    if (!campaignId) throw new Error("Create a campaign first.");
    const normalizedNames = manualColumns.map((column) =>
      column.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    );
    if (normalizedNames.some((name) => !name)) throw new Error("Every column needs a name.");
    if (new Set(normalizedNames).size !== normalizedNames.length) throw new Error("Column names must be unique.");
    if (!manualRowCount) throw new Error("Paste at least one email address.");

    const valueColumns = manualColumns.map((column) => columnLines(column.values));
    const rows = Array.from({ length: manualRowCount }, (_, rowIndex) =>
      Object.fromEntries(
        normalizedNames.map((name, columnIndex) => [name, valueColumns[columnIndex]?.[rowIndex] ?? ""]),
      ),
    );
    await submitRecipientRows(rows, 1);
  });

  const toggleLead = async (lead: Lead) => {
    const selected = !lead.selected;
    setLeads((items) => items.map((item) => item.id === lead.id ? { ...item, selected } : item));
    try {
      await api("/api/leads", { method: "PATCH", body: JSON.stringify({ leadId: lead.id, selected }) });
    } catch (err) {
      setLeads((items) => items.map((item) => item.id === lead.id ? lead : item));
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const selected = templates.find((template) => template.id === id);
    if (selected) {
      setTemplateName(selected.name);
      setSubject(selected.subject);
      setBody(selected.body);
      setPreviews([]);
    }
  };

  const insertField = (field: string) => {
    const token = `{{${field}}}`;
    if (activeField === "subject") setSubject((value) => value + token);
    else setBody((value) => value + token);
    setPreviews([]);
  };

  const saveTemplate = () => run("save-template", async () => {
    const data = await api<{ template: Template }>("/api/templates", {
      method: templateId ? "PATCH" : "POST",
      body: JSON.stringify({ id: templateId || undefined, name: templateName, subject, body }),
    });
    setTemplates((items) => [data.template, ...items.filter((item) => item.id !== data.template.id)]);
    setTemplateId(data.template.id);
    setNotice(templateId ? "Template updated." : "Template saved for future campaigns.");
  });

  const previewTemplate = () => run("preview", async () => {
    const data = await api<{ previews: Preview[] }>("/api/drafts/template", {
      method: "POST",
      body: JSON.stringify({ campaignId, subject, body, templateName, previewOnly: true }),
    });
    setPreviews(data.previews);
  });

  const createDrafts = () => run("drafts", async () => {
    const data = await api<{ drafts: Draft[] }>("/api/drafts/template", {
      method: "POST",
      body: JSON.stringify({ campaignId, subject, body, templateName }),
    });
    setDrafts(data.drafts);
    setStage(4);
  });

  const editDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));

  const persistDraft = async (id: string, patch: Partial<Draft> = {}) => {
    const current = drafts.find((draft) => draft.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    editDraft(id, patch);
    try {
      await api("/api/drafts", {
        method: "PATCH",
        body: JSON.stringify({ draftId: id, subject: next.subject, body: next.body, approved: next.approved }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const approveAll = () => run("approve", async () => {
    await api("/api/drafts", {
      method: "PATCH",
      body: JSON.stringify({ campaignId, approveAll: true }),
    });
    setDrafts((items) => items.map((draft) => ({ ...draft, approved: true })));
  });

  const sendTest = () => run("test", async () => {
    const draft = drafts[0];
    if (!testEmail.includes("@")) throw new Error("Enter a valid test email address.");
    try { localStorage.setItem("sk_test_email", testEmail.trim()); } catch {}
    await api("/api/send/test", {
      method: "POST",
      body: JSON.stringify({
        toEmail: testEmail.trim(),
        draftId: draft?.id,
        subject: draft?.subject || subject,
        body: draft?.body || body,
      }),
    });
    setNotice(`Test email sent to ${testEmail.trim()}.`);
  });

  const startSending = () => run("send", async () => {
    await api("/api/send", { method: "POST", body: JSON.stringify({ campaignId }) });
    const poll = async () => {
      try {
        const data = await api<{ job: SendJob | null }>(`/api/send?campaignId=${campaignId}`);
        setJob(data.job);
        if (data.job && !data.job.running && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    await poll();
    pollRef.current = setInterval(poll, 3000);
  });

  const selectedCount = leads.filter((lead) => lead.selected).length;
  const approvedCount = drafts.filter((draft) => draft.approved).length;
  const missingCount = previews.filter((preview) => preview.missing.length).length;
  const missingConfig = config
    ? [
        !config.database && "DATABASE_URL",
        !config.credentialsEncryption && "CREDENTIALS_ENCRYPTION_KEY",
        !config.smtp && "verified sending mailbox",
        !config.compliance && "unsubscribe secret / sender postal address",
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <BulkSteps current={stage} />
        <Button variant="ghost" onClick={() => onSwitchToAi(leads)} className="text-xs">Use AI workflow</Button>
      </div>

      <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
        <button type="button" onClick={() => onSwitchToAi(leads)} className="rounded-lg px-4 py-2 text-sm text-[#9494a8] hover:text-white">AI-personalized campaign</button>
        <button type="button" className="rounded-lg bg-violet-500/15 px-4 py-2 text-sm font-medium text-violet-200 ring-1 ring-violet-400/25">Template bulk email</button>
      </div>

      {missingConfig.length > 0 && <Alert tone="warn">Not configured yet: <b>{missingConfig.join(", ")}</b>.</Alert>}
      {config && !config.publicBaseUrl && <Alert tone="error"><b>Sending is blocked:</b> set <code>APP_BASE_URL</code> to a public URL so unsubscribe links work.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      {stage === 1 && (
        <div className={card}>
          <div className="mb-5 max-w-2xl">
            <Pill tone="neutral">No AI credits required</Pill>
            <h2 className="mt-3 text-xl font-semibold">Start a template campaign</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#9494a8]">Import recipients, merge their CSV data into one reusable template, preview every result, then approve before sending.</p>
          </div>
          <label className={label}>Campaign name</label>
          <input className={`${input} max-w-xl`} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="September product update" />
          <Button onClick={startCampaign} busy={busy === "campaign"} disabled={!campaignName.trim()} className="mt-4">Create campaign</Button>
        </div>
      )}

      {stage === 2 && (
        <div className="space-y-5">
          <div className={card}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add recipients</h2>
                <p className="mt-1 text-sm text-[#9494a8]">Upload a complete CSV or paste data one column at a time. Every column becomes an available template field.</p>
              </div>
              <div className="min-w-44">
                <label className={label}>When importing</label>
                <select className={input} value={importMode} onChange={(event) => setImportMode(event.target.value as "append" | "replace")}>
                  <option value="replace">Replace current list</option>
                  <option value="append">Append to current list</option>
                </select>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
              <button type="button" onClick={() => setRecipientInputMode("csv")} className={`rounded-lg px-4 py-2 text-sm transition ${recipientInputMode === "csv" ? "bg-violet-500/15 font-medium text-violet-200 ring-1 ring-violet-400/25" : "text-[#9494a8] hover:text-white"}`}>Upload CSV</button>
              <button type="button" onClick={() => setRecipientInputMode("columns")} className={`rounded-lg px-4 py-2 text-sm transition ${recipientInputMode === "columns" ? "bg-violet-500/15 font-medium text-violet-200 ring-1 ring-violet-400/25" : "text-[#9494a8] hover:text-white"}`}>Paste by column</button>
            </div>

            {recipientInputMode === "csv" && (
              <label className="mt-5 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-violet-400/35 bg-violet-500/5 px-6 py-10 text-center hover:bg-violet-500/10">
                <span>
                  <span className="block font-medium text-violet-200">{busy === "import" ? "Importing…" : "Choose CSV file"}</span>
                  <span className="mt-1 block text-xs text-[#77778c]">Requires an email column · up to 1,000 recipients</span>
                </span>
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy !== null} onChange={(event) => importCsv(event.target.files?.[0])} />
              </label>
            )}

            {recipientInputMode === "columns" && (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Paste one value per line</h3>
                    <p className="text-xs text-[#77778c]">Line 1 in every column forms recipient 1, line 2 forms recipient 2, and so on. Shorter optional columns are filled with blanks.</p>
                  </div>
                  <div className="flex items-center gap-2"><Pill tone="neutral">{manualRowCount} aligned row{manualRowCount === 1 ? "" : "s"}</Pill><Button variant="ghost" onClick={addManualColumn}>Add custom column</Button></div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {manualColumns.map((column) => {
                    const count = columnLines(column.values).length;
                    return (
                      <div key={column.id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          {column.locked ? (
                            <code className="min-w-0 flex-1 truncate text-xs text-violet-200">{column.name}{column.name === "email" ? " *" : ""}</code>
                          ) : (
                            <input className={`${input} min-w-0 flex-1 py-1.5 font-mono text-xs`} value={column.name} onChange={(event) => updateManualColumn(column.id, { name: event.target.value })} placeholder="custom_field" />
                          )}
                          <span className="shrink-0 text-[11px] text-[#61617a]">{count} value{count === 1 ? "" : "s"}</span>
                          {!column.locked && <button type="button" onClick={() => removeManualColumn(column.id)} className="rounded px-1.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10" aria-label={`Remove ${column.name} column`}>×</button>}
                        </div>
                        <textarea className={`${input} h-36 resize-y whitespace-pre font-mono text-xs leading-6`} value={column.values} onChange={(event) => updateManualColumn(column.id, { values: event.target.value })} placeholder={column.name === "email" ? "alex@example.com\nsam@example.com" : "Value for recipient 1\nValue for recipient 2"} />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#77778c]">Column names are normalized to merge tags, for example <code>Industry Type</code> becomes <code>{"{{industry_type}}"}</code>.</p>
                  <Button onClick={importManualColumns} busy={busy === "import-columns"} disabled={!manualRowCount}>Import {manualRowCount || ""} row{manualRowCount === 1 ? "" : "s"}</Button>
                </div>
              </div>
            )}
          </div>

          {leads.length > 0 && (
            <div className={card}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-semibold">Recipients</h3><p className="text-sm text-[#9494a8]">{selectedCount} of {leads.length} selected</p></div>
                <Button onClick={() => setStage(3)} disabled={!selectedCount}>Build template</Button>
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/8">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#101018] text-left"><tr><th className="p-3">Send</th><th className="p-3">Recipient</th><th className="p-3">Company</th><th className="p-3">Email</th></tr></thead>
                  <tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-white/6">
                    <td className="p-3"><input type="checkbox" checked={lead.selected} onChange={() => toggleLead(lead)} className="size-4 accent-violet-500" /></td>
                    <td className="p-3 text-[#edecf2]">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}<div className="text-xs text-[#77778c]">{lead.title}</div></td>
                    <td className="p-3 text-[#b9b8c9]">{lead.company_name || "—"}</td>
                    <td className="p-3 font-mono text-xs text-[#9494a8]">{lead.email}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === 3 && (
        <div className="space-y-5">
          <div className={card}>
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <div className="min-w-[15rem] flex-1"><label className={label}>Saved template</label><select className={input} value={templateId} onChange={(event) => chooseTemplate(event.target.value)}><option value="">New template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></div>
              <div className="min-w-[15rem] flex-1"><label className={label}>Template name</label><input className={input} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Product announcement" /></div>
              <Button variant="ghost" onClick={saveTemplate} busy={busy === "save-template"} disabled={!templateName.trim() || !subject.trim() || !body.trim()}>{templateId ? "Update template" : "Save template"}</Button>
            </div>

            <label className={label}>Subject</label>
            <input className={input} value={subject} onFocus={() => setActiveField("subject")} onChange={(event) => { setSubject(event.target.value); setPreviews([]); }} placeholder="A quick idea for {{company_name}}" />
            <label className={`${label} mt-4`}>Body <span className="font-normal text-[#77778c]">— greeting, signature, address, and unsubscribe link are added automatically</span></label>
            <textarea className={`${input} h-52 resize-y leading-relaxed`} value={body} onFocus={() => setActiveField("body")} onChange={(event) => { setBody(event.target.value); setPreviews([]); }} placeholder={"I noticed {{company_name}} is growing...\n\nWould this be useful for your team?"} />

            <div className="mt-4"><div className="sk-eyebrow mb-2">Insert into {activeField}</div><div className="flex flex-wrap gap-2">{fields.map((field) => <button type="button" key={field} onClick={() => insertField(field)} className="sk-chip font-mono hover:border-violet-400/40 hover:text-white">{`{{${field}}}`}</button>)}</div></div>
            <div className="mt-5 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setStage(2)}>Back to recipients</Button><Button onClick={previewTemplate} busy={busy === "preview"} disabled={!subject.trim() || !body.trim()}>Preview {selectedCount} emails</Button></div>
          </div>

          {previews.length > 0 && (
            <div className={card}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Rendered preview</h3><p className="text-sm text-[#9494a8]">Review exactly what each recipient will receive.</p></div><Button onClick={createDrafts} busy={busy === "drafts"} disabled={missingCount > 0}>Create {previews.length} drafts</Button></div>
              {missingCount > 0 && <Alert tone="warn">{missingCount} recipient{missingCount === 1 ? " has" : "s have"} missing merge data. Remove those fields or go back and unselect the affected recipients before creating drafts.</Alert>}
              <div className="mt-4 space-y-3">{previews.map((preview) => <details key={preview.leadId} className="rounded-xl border border-white/8 bg-black/20 p-4" open={previews.length <= 3}><summary className="cursor-pointer text-sm font-medium">{preview.name || preview.email} <span className="font-normal text-[#77778c]">· {preview.email}</span>{preview.missing.length > 0 && <span className="ml-2 text-amber-300">missing: {preview.missing.join(", ")}</span>}</summary><div className="mt-3 border-t border-white/8 pt-3"><div className="text-sm font-medium">{preview.subject}</div><div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#b9b8c9]">Hi {preview.name.split(" ")[0] || "there"},{"\n\n"}{preview.body}</div></div></details>)}</div>
            </div>
          )}
        </div>
      )}

      {stage === 4 && (
        <div className="space-y-5">
          <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
            <div><div className="font-medium">{approvedCount} of {drafts.length} approved</div><p className="text-sm text-[#9494a8]">Every message remains editable. Only approved drafts will send.</p></div>
            <div className="flex flex-wrap gap-2"><input className={`${input} w-56`} type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="Test recipient email" /><Button variant="ghost" onClick={sendTest} busy={busy === "test"}>Send test</Button><Button variant="ghost" onClick={approveAll} busy={busy === "approve"}>Approve all</Button><Button onClick={startSending} busy={busy === "send" || Boolean(job?.running)} disabled={!approvedCount || Boolean(job?.running)}>{job?.running ? "Sending…" : `Send ${approvedCount}`}</Button></div>
          </div>

          {job && <Alert tone={job.error ? "error" : "info"}><div className="font-medium">{job.done} / {job.total} processed {job.running ? "— in progress" : "— finished"}</div>{job.error && <div>{job.error}</div>}<ul className="mt-2">{job.outcomes.slice(-8).map((outcome, index) => <li key={index}><span className={outcome.status === "sent" ? "text-emerald-400" : outcome.status === "failed" ? "text-rose-400" : "text-[#9494a8]"}>{outcome.status}</span> {outcome.email} {outcome.detail}</li>)}</ul></Alert>}

          {drafts.map((draft) => {
            const lead = leads.find((item) => item.id === draft.lead_id);
            return <div key={draft.id} className={`${card} ${draft.approved ? "border-emerald-400/25" : ""}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || lead?.email}</div><div className="font-mono text-xs text-[#77778c]">{lead?.email}</div></div><label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${draft.approved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-[#9494a8]"}`}><input type="checkbox" checked={draft.approved} onChange={() => persistDraft(draft.id, { approved: !draft.approved })} className="size-4 accent-emerald-500" />{draft.approved ? "Approved" : "Approve"}</label></div>
              <input className={`${input} mb-2 font-medium`} value={draft.subject} onChange={(event) => editDraft(draft.id, { subject: event.target.value })} onBlur={() => persistDraft(draft.id)} />
              <textarea className={`${input} h-44 resize-y leading-relaxed`} value={draft.body} onChange={(event) => editDraft(draft.id, { body: event.target.value })} onBlur={() => persistDraft(draft.id)} />
            </div>;
          })}
        </div>
      )}
    </div>
  );
}
