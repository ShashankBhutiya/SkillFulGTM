import Wizard from "@/components/Wizard";
import SiteHeader from "@/components/site/SiteHeader";
import Hero from "@/components/site/Hero";
import Guardrails from "@/components/site/Guardrails";
import SiteFooter from "@/components/site/SiteFooter";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <Hero />
      <Guardrails />

      <section id="app" className="sk-section px-5 pb-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <div className="sk-eyebrow mb-3">Launch</div>
            <h2 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">
              Run a campaign
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-[#8b8b9e]">
              Four steps. You can edit the output of every one before moving on.
            </p>
          </div>
          <Wizard />
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
