import { NextResponse } from "next/server";
import { verifyTransport, sendTestEmail } from "@/lib/email/sender";
import { store } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
    const check = await verifyTransport();
    if (!check.ok) {
      return NextResponse.json(
        {
          error: `SMTP connection failed: ${check.error}. Please verify your SMTP settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) in .env.local.`,
          details: check.error,
        },
        { status: 502 },
      );
    }

    let testSubject = subject;
    let testBody = body;
    let testFirstName = "Test Recipient";

    if (draftId) {
      const draft = await store.getDraft(draftId);
      if (draft) {
        testSubject = draft.subject;
        testBody = draft.body;
        const lead = await store.getLead(draft.lead_id);
        if (lead?.first_name) {
          testFirstName = lead.first_name;
        }
      }
    }

    const result = await sendTestEmail({
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
}
