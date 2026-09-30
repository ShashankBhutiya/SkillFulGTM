import { NextResponse } from "next/server";
import { configStatus } from "@/lib/env";
import { store } from "@/lib/db";
import { currentUser, unauthorized } from "@/lib/auth";
import { getMailbox } from "@/lib/mailbox";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const config = configStatus();

  // This endpoint powers the "what isn't configured yet" banner, so it must
  // still answer when the database is the thing that isn't configured.
  let campaigns: Awaited<ReturnType<typeof store.listCampaigns>> = [];
  let databaseError: string | undefined;
  try {
    campaigns = await store.listCampaigns(user.id);
  } catch (err) {
    databaseError = err instanceof Error ? err.message : String(err);
  }

  const mailbox = databaseError ? null : await getMailbox(user.id);
  return NextResponse.json({
    user,
    config: { ...config, database: config.database && !databaseError, smtp: Boolean(mailbox?.verified_at), compliance: config.compliance && Boolean(mailbox?.postal_address) },
    databaseError,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      companyName: c.company_name,
      status: c.status,
      createdAt: c.created_at,
    })),
  });
}
