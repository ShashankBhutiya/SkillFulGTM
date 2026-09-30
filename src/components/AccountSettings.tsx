"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, card, input, label } from "./ui";

type Mailbox = { host: string; port: number; secure: boolean; username: string; fromName: string; fromEmail: string; replyTo: string; postalAddress: string; maxSendsPerDay: number; secondsBetween: number; verifiedAt: string | null; hasPassword: boolean };
const empty: Mailbox = { host: "smtp.gmail.com", port: 587, secure: false, username: "", fromName: "", fromEmail: "", replyTo: "", postalAddress: "", maxSendsPerDay: 40, secondsBetween: 45, verifiedAt: null, hasPassword: false };

export default function AccountSettings({ name, email, emailVerified, welcome }: { name: string; email: string; emailVerified: boolean; welcome: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Mailbox>(empty);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(welcome ? { tone: "info", text: "Account created. Connect the mailbox you want to send from." } : null);
  useEffect(() => { fetch("/api/account/mailbox").then((r) => r.json()).then((d: { mailbox: Mailbox | null }) => { if (d.mailbox) setForm(d.mailbox); }); }, []);
  const update = <K extends keyof Mailbox>(key: K, value: Mailbox[K]) => setForm((f) => ({ ...f, [key]: value }));
  async function request(method: string, body?: unknown) {
    const response = await fetch("/api/account/mailbox", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = (await response.json()) as { error?: string; mailbox?: Mailbox };
    if (!response.ok) throw new Error(data.error ?? "Request failed.");
    if (data.mailbox) setForm(data.mailbox);
  }
  async function save(event: FormEvent) { event.preventDefault(); setBusy("save"); setMessage(null); try { await request("PUT", { ...form, password }); setPassword(""); setMessage({ tone: "info", text: "Mailbox settings saved. Verify the connection before sending." }); } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(""); } }
  async function verify() { setBusy("verify"); setMessage(null); try { await request("POST"); setMessage({ tone: "info", text: "Mailbox connection verified successfully." }); } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(""); } }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }
  async function resendVerification() { setBusy("resend"); setMessage(null); try { const response = await fetch("/api/auth/resend-verification", { method: "POST" }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "Could not send verification email."); setMessage({ tone: "info", text: "Verification email sent." }); } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(""); } }

  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><a href="/" className="text-sm text-violet-300 hover:text-white">← Back to campaigns</a><h1 className="mt-3 text-3xl font-semibold">Account settings</h1><p className="mt-1 text-sm text-[#9494a8]">{name} · {email}</p></div><Button variant="ghost" onClick={logout}>Sign out</Button></div>
    {message && <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div>}
    {!emailVerified && <div className="mb-5"><Alert tone="warn"><div><b>Verify your account email before sending campaigns.</b><div className="mt-2"><Button variant="ghost" onClick={resendVerification} busy={busy === "resend"}>Resend verification email</Button></div></div></Alert></div>}
    <form onSubmit={save} className={card}>
      <div className="mb-5"><h2 className="text-lg font-semibold">Sending mailbox</h2><p className="mt-1 text-sm text-[#9494a8]">Use an app password where your provider supports one. Your secret is encrypted before it is stored.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className={label}>SMTP host</label><input className={input} value={form.host} onChange={(e) => update("host", e.target.value)} required /></div><div><label className={label}>Port</label><input className={input} type="number" value={form.port} onChange={(e) => update("port", Number(e.target.value))} required /></div></div>
      <label className="mt-3 flex items-center gap-2 text-sm text-[#b9b8c9]"><input type="checkbox" checked={form.secure} onChange={(e) => update("secure", e.target.checked)} className="accent-violet-500" />Implicit TLS (normally enabled only for port 465)</label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className={label}>SMTP username</label><input className={input} value={form.username} onChange={(e) => update("username", e.target.value)} autoComplete="username" required /></div><div><label className={label}>SMTP password {form.hasPassword && <span className="font-normal text-[#77778c]">— leave blank to keep</span>}</label><input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required={!form.hasPassword} /></div></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className={label}>Sender name</label><input className={input} value={form.fromName} onChange={(e) => update("fromName", e.target.value)} /></div><div><label className={label}>From email</label><input className={input} type="email" value={form.fromEmail} onChange={(e) => update("fromEmail", e.target.value)} required /></div></div>
      <div className="mt-4"><label className={label}>Reply-to email <span className="font-normal text-[#77778c]">— optional</span></label><input className={input} type="email" value={form.replyTo} onChange={(e) => update("replyTo", e.target.value)} /></div>
      <div className="mt-4"><label className={label}>Physical postal address</label><textarea className={`${input} h-20 resize-y`} value={form.postalAddress} onChange={(e) => update("postalAddress", e.target.value)} required /><p className="mt-1.5 text-xs text-[#77778c]">Included in every commercial email footer.</p></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className={label}>Daily send limit</label><input className={input} type="number" min={1} max={1000} value={form.maxSendsPerDay} onChange={(e) => update("maxSendsPerDay", Number(e.target.value))} /></div><div><label className={label}>Seconds between sends</label><input className={input} type="number" min={1} max={3600} value={form.secondsBetween} onChange={(e) => update("secondsBetween", Number(e.target.value))} /></div></div>
      <div className="mt-6 flex flex-wrap items-center gap-3"><Button busy={busy === "save"} disabled={Boolean(busy)}>Save mailbox</Button><Button type="button" variant="ghost" onClick={verify} busy={busy === "verify"} disabled={Boolean(busy) || !form.hasPassword}>Verify connection</Button><span className={`text-xs ${form.verifiedAt ? "text-emerald-400" : "text-amber-300"}`}>{form.verifiedAt ? "Verified" : "Not verified"}</span></div>
    </form>
  </main>;
}
