const STAGES = [
  {
    tag: "Gemini",
    title: "Ideal customer profile",
    body: "Describe your product once. Get firmographics, buying-committee personas, trigger signals, and the accounts worth disqualifying.",
    icon: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3Z",
  },
  {
    tag: "Exa",
    title: "Find the companies",
    body: "The profile becomes real web searches that surface in-market accounts — and reads each company's own site for context.",
    icon: "M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z",
  },
  {
    tag: "Hunter",
    title: "Find the people",
    body: "Decision-makers at each company, filtered to the roles on your buying committee, with verified addresses.",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-2a4 4 0 0 0-3-3.9",
  },
  {
    tag: "SMTP",
    title: "Write and send",
    body: "An email per person, grounded in a real fact about their company. You review every one before it leaves your mailbox.",
    icon: "M3 7l9 6 9-6M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z",
  },
];

export default function Hero() {
  return (
    <section id="top" className="relative px-5 pt-16 pb-4 sm:pt-24">
      <div className="mx-auto max-w-6xl">
        <div className="sk-stagger max-w-3xl">
          <div className="sk-chip mb-6 w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Agentic outbound, end to end
          </div>

          <h1 className="sk-display">
            <span className="sk-gradient-text">Describe your company.</span>
            <br />
            Get a pipeline, not a lead list.
          </h1>

          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[#9494a8]">
            SkillfulGTM derives your ideal customer profile, finds the companies that
            match it, finds the decision-makers inside them, and writes a genuinely
            personalized email for each one.{" "}
            <span className="text-[#d7d6e3]">
              Nothing sends until you have read it.
            </span>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#app" className="sk-btn sk-btn-primary">
              Start a campaign
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h14m-6-6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a href="#how" className="sk-btn sk-btn-ghost">
              How it works
            </a>
          </div>
        </div>

        {/* Pipeline strip. Four stages with the data actually flowing between
            them — the clearest way to say what this is. */}
        <div id="pipeline" className="sk-section sk-frame mt-16">
          <div className="p-6 sm:p-8">
            <div className="sk-eyebrow mb-6">The pipeline</div>
            <ol className="grid gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-4">
              {STAGES.map((s, i) => (
                <li key={s.tag} className="relative lg:pr-4">
                  {/* Connector to the next stage, desktop only. */}
                  {i < STAGES.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute right-0 top-5 hidden h-px w-4 lg:block"
                      style={{
                        background:
                          "linear-gradient(90deg, rgba(124,92,255,.6), rgba(79,157,255,.15))",
                      }}
                    />
                  )}

                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10"
                      style={{
                        background:
                          "linear-gradient(160deg, rgba(124,92,255,.22), rgba(79,157,255,.08))",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d={s.icon}
                          stroke="#c4b5ff"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7c5cff]">
                        {s.tag}
                      </div>
                      <div className="text-sm font-medium text-[#edecf2]">{s.title}</div>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-[#8b8b9e]">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
