const ITEMS = [
  {
    title: "You approve every email",
    body: "Drafts land in a review queue. Nothing is sent until you have read it and ticked approve — and you can rewrite any of it first.",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    title: "Addresses are verified first",
    body: "A hard bounce is permanent damage to a young domain. Every address is checked before it is mailed, and confirmed-bad ones are suppressed forever.",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  },
  {
    title: "Working one-click unsubscribe",
    body: "Signed opt-out links plus the RFC 8058 header, so Gmail and Outlook show a native unsubscribe button instead of a report-spam one.",
    icon: "M18.4 5.6a9 9 0 1 1-12.8 0M12 2v9",
  },
  {
    title: "Sending is paced",
    body: "A daily cap and a gap between messages. Bursts from a cold domain get classified as spam, and that reputation is slow to earn back.",
    icon: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
];

export default function Guardrails() {
  return (
    <section id="how" className="sk-section px-5 py-20">
      <div id="guardrails" className="scroll-mt-24" />
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <div className="sk-eyebrow mb-3">Built for real sending</div>
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">
            Automation is the easy half.{" "}
            <span className="text-[#9494a8]">Not burning your domain is the rest.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#8b8b9e]">
            These are not settings buried in a menu — they are the default path, and the
            app refuses to send when they are not satisfied.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <div
              key={it.title}
              className="group rounded-2xl border border-white/8 bg-white/[0.02] p-6 transition-colors hover:border-violet-400/25 hover:bg-white/[0.035]"
            >
              <span
                className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-white/10"
                style={{
                  background:
                    "linear-gradient(160deg, rgba(52,211,153,.18), rgba(124,92,255,.08))",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d={it.icon}
                    stroke="#6ee7b7"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h3 className="mb-2 font-medium text-[#edecf2]">{it.title}</h3>
              <p className="text-sm leading-relaxed text-[#8b8b9e]">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
