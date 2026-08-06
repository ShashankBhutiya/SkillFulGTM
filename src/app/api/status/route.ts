import { NextResponse } from "next/server";
import { configStatus } from "@/lib/env";
import { store } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const config = configStatus();

  // This endpoint powers the "what isn't configured yet" banner, so it must
  // still answer when the database is the thing that isn't configured.
  let campaigns: Awaited<ReturnType<typeof store.listCampaigns>> = [];
  let databaseError: string | undefined;
  try {
    campaigns = await store.listCampaigns();
  } catch (err) {
    databaseError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    config: { ...config, database: config.database && !databaseError },
    databaseError,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      companyName: c.company_name,
      status: c.status,
      createdAt: c.created_at,
    })),
  });
}
