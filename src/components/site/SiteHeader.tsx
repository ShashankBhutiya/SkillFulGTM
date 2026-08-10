"use client";

import { useEffect, useRef, useState } from "react";
import { Mark, Wordmark } from "./Logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#app", label: "Launch" },
];

export default function SiteHeader() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // The border only appears once content is scrolling underneath — a hairline
  // against the hero looks like a mistake.
  //
  // Driven by a sentinel rather than a scroll listener: this fires from the
  // compositor on intersection rather than on every scroll frame, so it costs
  // nothing during scrolling and stays correct if the page is moved
  // programmatically (anchor jumps, restored scroll position) where scroll
  // events are not guaranteed to fire.
  useEffect(() => {
    // Covers a scroll position restored on reload, where the first observer
    // callback may lag a frame behind paint.
    setStuck(window.scrollY > 1);

    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry!.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px w-full" />
      <header className="sk-nav" data-stuck={stuck}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <a href="#top" className="flex items-center gap-2.5">
            <Mark size={32} />
            <Wordmark className="text-[17px]" />
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="sk-navlink">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a href="#app" className="sk-btn sk-btn-primary hidden sm:inline-flex">
              Start a campaign
            </a>
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#9494a8] transition-colors hover:text-white md:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d={open ? "M6 6l12 12M18 6L6 18" : "M3 6h18M3 12h18M3 18h18"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-white/8 bg-[#07070b]/95 md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col px-5 py-2">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-white/6 py-3 text-sm text-[#9494a8] last:border-0"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
          )}
      </header>
    </>
  );
}
