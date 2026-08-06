"use client";

import type { ReactNode } from "react";

export const card = "sk-card";
export const input = "sk-input";
export const label = "sk-label";

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Shows a spinner and blocks input. */
  busy?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "sk-btn-primary",
    ghost: "sk-btn-ghost",
    danger: "sk-btn-danger",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`sk-btn ${styles} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="sk-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ALERT_ICON = {
  error:
    "M12 8v5m0 3.5h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  warn: "M12 8v5m0 3.5h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  info: "M12 16v-5m0-3.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

export function Alert({
  tone,
  children,
}: {
  tone: "error" | "warn" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-rose-500/25 bg-rose-500/10 text-rose-200",
    warn: "border-amber-500/25 bg-amber-500/10 text-amber-100",
    info: "border-white/10 bg-white/5 text-zinc-300",
  }[tone];
  const iconColor = {
    error: "text-rose-400",
    warn: "text-amber-400",
    info: "text-zinc-400",
  }[tone];

  return (
    <div
      className={`sk-rise flex gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${styles}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className={`mt-0.5 shrink-0 ${iconColor}`}
      >
        <path
          d={ALERT_ICON[tone]}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Progress rail. Completed steps collapse to a check so the eye lands on the
 * current one; the connecting line fills to show how far along the run is.
 */
export function Steps({ current }: { current: number }) {
  const names = ["Company", "ICP", "Leads", "Emails"];

  return (
    <ol className="mb-7 flex items-center">
      {names.map((n, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;

        return (
          <li
            key={n}
            className={i < names.length - 1 ? "flex flex-1 items-center" : "flex items-center"}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
                  done
                    ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                    : active
                      ? "text-white ring-1 ring-violet-400/40"
                      : "text-[#5c5c74] ring-1 ring-white/10"
                }`}
                style={
                  active
                    ? {
                        background: "linear-gradient(180deg,#9d85ff,#7c5cff 55%,#5b3ce0)",
                        boxShadow: "0 6px 18px -6px rgba(124,92,255,.75)",
                      }
                    : undefined
                }
              >
                {done ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path
                      d="m5 13 4.5 4.5L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  step
                )}
              </span>
              <span
                className={`hidden text-sm sm:block ${
                  active
                    ? "font-medium text-white"
                    : done
                      ? "text-[#9494a8]"
                      : "text-[#5c5c74]"
                }`}
              >
                {n}
              </span>
            </div>

            {i < names.length - 1 && (
              <div className="mx-3 h-px flex-1 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: done ? "100%" : "0%",
                    background: "linear-gradient(90deg,#34d399,#7c5cff)",
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Labelled statistic used in the ICP summary grid. */
export function Stat({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 px-3.5 py-3">
      <div className="sk-eyebrow mb-1.5">{l}</div>
      <div className="text-sm leading-snug text-[#d7d6e3]">{value}</div>
    </div>
  );
}

/** Colour-coded status pill. */
export function Pill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  children: ReactNode;
}) {
  const styles = {
    good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    bad: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    neutral: "border-white/10 bg-white/5 text-[#9494a8]",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {children}
    </span>
  );
}
