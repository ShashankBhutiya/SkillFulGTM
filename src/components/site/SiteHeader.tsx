"use client";

import { useEffect, useRef, useState } from "react";
import { Mark, Wordmark } from "./Logo";

const LINKS = [
  { href: "#how", id: "how", label: "How it works" },
  { href: "#pipeline", id: "pipeline", label: "Pipeline" },
  { href: "#guardrails", id: "guardrails", label: "Guardrails" },
  { href: "#app", id: "app", label: "Launch" },
];

export default function SiteHeader({ user }: { user: { name: string; email: string } | null }) {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const sentinel = useRef<HTMLDivElement>(null);

  // Sentinel intersection observer to update header background when scrolling down
  useEffect(() => {
    setStuck(window.scrollY > 4);

    const el = sentinel.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Section observer to track active navigation item based on scroll position
  useEffect(() => {
    const sectionIds = LINKS.map((l) => l.id);
    const observerCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const io = new IntersectionObserver(observerCallback, {
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0.1,
    });

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  // Close mobile menu on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px w-full" />
      
      <header
        className="sk-nav transition-all duration-300"
        data-stuck={stuck}
        role="banner"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          {/* Brand Logo & Engine Status Badge */}
          <div className="flex items-center gap-3">
            <a
              href="#top"
              className="group flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg p-1 transition-transform hover:scale-[1.02]"
              aria-label="SkillfulGTM Home"
            >
              <Mark size={32} />
              <Wordmark className="text-[17px]" />
            </a>

            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI Engine Ready
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden items-center gap-8 md:flex" aria-label="Main Navigation">
            {LINKS.map((l) => {
              const isActive = activeSection === l.id;
              return (
                <a
                  key={l.href}
                  href={l.href}
                  className={`sk-navlink text-sm font-medium transition-colors ${
                    isActive ? "text-white" : "text-[#9494a8] hover:text-white"
                  }`}
                >
                  {l.label}
                  {isActive && (
                    <span className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-gradient-to-r from-[#9d85ff] to-[#4f9dff]" />
                  )}
                </a>
              );
            })}
          </nav>

          {/* Desktop & Mobile Actions */}
          <div className="flex items-center gap-3">
            <a
              href={user ? "/account" : "/signup"}
              className="sk-btn sk-btn-primary hidden sm:inline-flex group shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25"
            >
              <span>{user ? user.name.split(" ")[0] || "Account" : "Create account"}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                <path
                  d="M5 12h14m-6-6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>

            {/* Mobile Navigation Menu Button */}
            <button
              type="button"
              aria-label={open ? "Close Navigation Menu" : "Open Navigation Menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/12 bg-white/[0.04] text-[#a1a1b5] transition-all hover:border-white/25 hover:bg-white/[0.08] hover:text-white md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                {open ? (
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {open && (
          <div
            id="mobile-menu"
            className="border-b border-white/10 bg-[#07070b]/95 backdrop-blur-2xl md:hidden animate-in slide-in-from-top duration-200"
          >
            <div className="mx-auto flex max-w-6xl flex-col px-5 py-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/8 pb-3">
                <span className="text-xs font-semibold tracking-wider uppercase text-[#61617a]">
                  Navigation
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Engine Ready
                </span>
              </div>

              <nav className="flex flex-col space-y-1">
                {LINKS.map((l) => {
                  const isActive = activeSection === l.id;
                  return (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-white/[0.08] text-white"
                          : "text-[#9494a8] hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span>{l.label}</span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#7c5cff]" />
                      )}
                    </a>
                  );
                })}
              </nav>

              <div className="pt-2">
                <a
                  href={user ? "/account" : "/signup"}
                  onClick={() => setOpen(false)}
                  className="sk-btn sk-btn-primary w-full justify-center text-center py-2.5"
                >
                  {user ? "Account settings" : "Create account"}
                </a>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
