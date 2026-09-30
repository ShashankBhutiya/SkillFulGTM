"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert, input, label } from "./ui";
import { responseJson } from "@/lib/client-api";

export default function AuthForm({ mode, initialError = "" }: { mode: "login" | "signup"; initialError?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup" && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "signup" && password.length < 12) {
      setError("Your password must contain at least 12 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await responseJson<{ warning?: string }>(response);
      router.push(mode === "signup" ? `/account?welcome=1${data.warning ? "&deliveryFailed=1" : ""}` : "/#app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#11111a]/90 p-7 shadow-2xl shadow-black/30">
      <h1 className="text-2xl font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#9494a8]">
        {mode === "signup" ? "Your campaigns and sending mailbox remain private to your account." : "Sign in to manage your campaigns and mailbox."}
      </p>
      {error && <div className="mt-5"><Alert tone="error">{error}</Alert></div>}
      {mode === "signup" && <div className="mt-5"><label className={label}>Name</label><input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} /></div>}
      <div className="mt-4"><label className={label}>Email</label><input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
      <div className="mt-4"><label className={label}>Password</label><input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={12} required /><p className="mt-1.5 text-xs text-[#77778c]">{mode === "signup" ? "At least 12 characters." : ""}</p></div>
      {mode === "login" && <div className="mt-2 text-right"><a href="/forgot-password" className="text-xs text-violet-300 hover:text-white">Forgot password?</a></div>}
      <Button type="submit" className="mt-5 w-full justify-center" busy={busy} disabled={busy}>{mode === "signup" ? "Create account" : "Sign in"}</Button>
      <p className="mt-5 text-center text-sm text-[#9494a8]">{mode === "signup" ? "Already have an account?" : "New to SkillfulGTM?"} <a className="text-violet-300 hover:text-violet-200" href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</a></p>
    </form>
  );
}
