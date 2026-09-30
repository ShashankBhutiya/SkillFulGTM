import { apiRoute } from "@/lib/api-route";
import { NextResponse } from "next/server";
import { verifyTransport, sendTestEmail } from "@/lib/email/sender";
import { store } from "@/lib/db";
import { currentUser, unauthorized } from "@/lib/auth";
import { getMailbox } from "@/lib/mailbox";

export const runtime = "nodejs";

export const POST = apiRoute(async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!user.email_verified) return NextResponse.json({ error: "Verify your account email before sending tests." }, { status: 403 });
  try {
    const { toEmail, subject, body, draftId } = (await req.json()) as {
      toEmail?: string;
      subject?: string;
      body?: string;
      draftId?: string;
    };

    if (!toEmail || typeof toEmail !== "string" || !toEmail.trim() || !toEmail.includes("@")) {
      return NextResponse.json(
        { error: "A valid recipient email address is required for sending a test email." },
        { status: 400 },
      );
    }

    // Verify SMTP connection credentials
    const mailbox = await getMailbox(user.id);
    if (!mailbox) {
      return NextResponse.json({ error: "Connect your sending mailbox in Account settings first." }, { status: 400 });
    }
    const recipient = toEmail.trim().toLowerCase();
    if (recipient !== user.email.toLowerCase() && recipient !== mailbox.from_email.toLowerCase()) {
      return NextResponse.json({ error: "Test emails can only be sent to your account or connected mailbox address." }, { status: 400 });
    }
    const check = await verifyTransport(mailbox);
    if (!check.ok) {
      return NextResponse.json(
        {
          error: `SMTP connection failed: ${check.error}. Please verify your mailbox settings.`,
          details: check.error,
        },
        { status: 502 },
      );
    }

    let testSubject = subject;
    let testBody = body;
    let testFirstName = "Test Recipient";

    if (draftId) {
      const draft = await store.getDraft(user.id, draftId);
      if (draft) {
        testSubject = draft.subject;
        testBody = draft.body;
        const lead = await store.getLead(user.id, draft.lead_id);
        if (lead?.first_name) {
          testFirstName = lead.first_name;
        }
      }
    }

    const result = await sendTestEmail({
      userId: user.id,
      mailbox,
      to: toEmail.trim(),
      subject: testSubject || "SkillfulGTM — Test Email Verification",
      body:
        testBody ||
        "This is a test email sent from your SkillfulGTM instance to verify that SMTP delivery is working correctly.",
      firstName: testFirstName,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Failed to send test email: ${result.error}`,
          details: result.error,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      recipient: toEmail.trim(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Test email error: ${errorMsg}` },
      { status: 500 },
    );
  }
});
