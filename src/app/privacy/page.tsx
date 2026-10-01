import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy | SkillFulGTM" };

export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-5 py-12 text-[#b9b8c9]">
    <a href="/" className="text-violet-300 underline">Back to SkillFulGTM</a>
    <h1 className="mt-6 text-3xl font-semibold text-white">Privacy policy</h1>
    <p className="mt-3">Updated October 1, 2026</p>
    <section className="mt-8 space-y-4 leading-relaxed">
      <h2 className="text-xl font-semibold text-white">Information we process</h2>
      <p>SkillFulGTM stores your account name, email address, password hash, sessions, campaign content, imported recipients, templates, send history, suppression entries, and sending preferences. These records are associated with your account.</p>
      <h2 className="text-xl font-semibold text-white">Google mailbox connection</h2>
      <p>Connecting Google shares your verified email address and authorization tokens with SkillFulGTM. Google SMTP requires the https://mail.google.com/ permission, which permits reading, composing, sending, and permanently deleting Gmail messages. SkillFulGTM uses this connection to send the messages you approve. The implemented connection does not read your inbox or delete Gmail messages.</p>
      <p>Mailbox passwords and Google refresh tokens are encrypted before database storage. They are not returned to the browser. Refresh tokens allow the app to obtain access tokens for later sending without asking for your Google password.</p>
      <h2 className="text-xl font-semibold text-white">Use and service providers</h2>
      <p>We process this information to operate your account, prepare campaigns, deliver approved messages, apply sending limits, and honor recipient opt-outs. Vercel hosts the app and the configured database provider stores account and campaign records. Google processes authorization and Gmail delivery. AI drafting and lead discovery, when used, send the relevant company, campaign, and lead information to Gemini, Exa, and Hunter. The Google mailbox connection is not used to supply inbox contents or authorization tokens to those services.</p>
      <p>SkillFulGTM's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-violet-300 underline">Google API Services User Data Policy</a>, including the Limited Use requirements. Google authorization data is not sold or used for advertising or to train generalized AI models.</p>
      <h2 className="text-xl font-semibold text-white">Retention and your choices</h2>
      <p>Account and campaign records remain in the database until removed. Sessions and recovery tokens expire. Disconnect Google in Account settings to remove the stored mailbox connection; you can also revoke authorization in your Google Account. Disconnecting does not remove your campaigns or send history. Contact support to request access, correction, or deletion of your account records. Recipient suppression records are used to prevent further unwanted outreach.</p>
      <h2 className="text-xl font-semibold text-white">Contact</h2>
      <p>For privacy questions and requests, email <a className="text-violet-300 underline" href="mailto:shashank10bhutiya@gmail.com">shashank10bhutiya@gmail.com</a>.</p>
    </section>
  </main>;
}
