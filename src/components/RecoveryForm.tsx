"use client";

import { FormEvent, useState } from "react";
import { Alert, Button, input, label } from "./ui";
import { responseJson } from "@/lib/client-api";

export default function RecoveryForm({ token }: { token?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; ok?: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      const endpoint = token ? "/api/auth/reset-password" : "/api/auth/forgot-password";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { token, password } : { email }) });
      await responseJson(response);
      setResult({ ok: token ? "Password changed. You can now sign in." : "If that account exists, a reset link has been sent." });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Request failed. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#11111a]/90 p-7">
    <h1 className="text-2xl font-semibold">{token ? "Choose a new password" : "Reset your password"}</h1>
    <p className="mt-2 text-sm text-[#9494a8]">{token ? "Your new password must contain at least 12 characters." : "Enter the email address used for your account."}</p>
    {result && <div className="mt-5"><Alert tone={result.error ? "error" : "info"}>{result.error ?? result.ok}</Alert></div>}
    <div className="mt-5"><label className={label}>{token ? "New password" : "Email"}</label><input className={input} type={token ? "password" : "email"} value={token ? password : email} onChange={(e) => token ? setPassword(e.target.value) : setEmail(e.target.value)} minLength={token ? 12 : undefined} required /></div>
    <Button className="mt-5 w-full justify-center" type="submit" busy={busy}>{token ? "Change password" : "Send reset link"}</Button>
    <p className="mt-5 text-center text-sm"><a href="/login" className="text-violet-300 hover:text-white">Back to sign in</a></p>
  </form>;
}
