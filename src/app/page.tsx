import Wizard from "@/components/Wizard";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-12">
      <header className="mb-9">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <h1 className="text-[22px] font-semibold leading-none tracking-tight">
              Skillful
              <span className="bg-gradient-to-r from-[#9d85ff] to-[#4f9dff] bg-clip-text text-transparent">
                GTM
              </span>
            </h1>
            <div className="sk-eyebrow mt-1.5">Agentic outbound</div>
          </div>
        </div>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#9494a8]">
          Describe your company once. Get an ideal customer profile, real people who match
          it, and an email written for each one —{" "}
          <span className="text-[#d7d6e3]">reviewed by you before anything sends.</span>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Chip>Gemini</Chip>
          <Chip>Exa</Chip>
          <Chip>Hunter</Chip>
          <Chip>SMTP</Chip>
        </div>
      </header>

      <Wizard />
    </main>
  );
}

/** Logo mark — concentric aperture suggesting targeting. */
function Mark() {
  return (
    <div
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
      style={{
        background: "linear-gradient(145deg,#9d85ff,#5b3ce0 60%,#3a24a8)",
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,.28) inset, 0 10px 26px -8px rgba(124,92,255,.7)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="1.6" opacity=".55" />
        <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="1.5" fill="white" />
        <path
          d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".75"
        />
      </svg>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="sk-chip">
      <span className="h-1.5 w-1.5 rounded-full bg-[#7c5cff]" />
      {children}
    </span>
  );
}
