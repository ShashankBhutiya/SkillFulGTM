import Wizard from "@/components/Wizard";
import SiteHeader from "@/components/site/SiteHeader";
import Hero from "@/components/site/Hero";
import Guardrails from "@/components/site/Guardrails";
import SiteFooter from "@/components/site/SiteFooter";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser();
  return (
    <>
      <SiteHeader user={user ? { name: user.name, email: user.email } : null} />
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
          {user ? <Wizard /> : (
            <div className="sk-card mx-auto max-w-xl p-8 text-center">
              <h3 className="text-xl font-semibold">Your outbound workspace</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9494a8]">Create a private account, connect your own mailbox, and keep every campaign, recipient, and template isolated from other users.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3"><a href="/signup" className="sk-btn sk-btn-primary">Create free account</a><a href="/login" className="sk-btn sk-btn-ghost">Sign in</a></div>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
