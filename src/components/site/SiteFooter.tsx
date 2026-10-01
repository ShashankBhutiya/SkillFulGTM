import { Mark, Wordmark } from "./Logo";

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/8">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div className="max-w-sm">
            <div className="mb-3 flex items-center gap-2.5">
              <Mark size={28} />
              <Wordmark className="text-[15px]" />
            </div>
            <p className="text-sm leading-relaxed text-[#61617a]">
              Agentic GTM. Company in, ideal customer profile out, personalized outreach
              sent — with a human gate at every step.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm sm:grid-cols-2">
            <div>
              <div className="sk-eyebrow mb-3">Product</div>
              <ul className="space-y-2 text-[#8b8b9e]">
                <li><a href="/privacy" className="transition-colors hover:text-white">Privacy policy</a></li>
                <li>
                  <a href="#how" className="transition-colors hover:text-white">
                    Guardrails
                  </a>
                </li>
                <li>
                  <a href="#pipeline" className="transition-colors hover:text-white">
                    Pipeline
                  </a>
                </li>
                <li>
                  <a href="#app" className="transition-colors hover:text-white">
                    Launch a campaign
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="sk-eyebrow mb-3">Powered by</div>
              <ul className="space-y-2 text-[#8b8b9e]">
                <li>Gemini</li>
                <li>Exa</li>
                <li>Hunter</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/6 pt-6 text-xs text-[#4a4a5e] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} SkillfulGTM</span>
          <span>
            Commercial email carries a working opt-out and a postal address, as the law
            requires.
          </span>
        </div>
      </div>
    </footer>
  );
}
