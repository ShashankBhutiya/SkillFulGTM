import { NextResponse } from "next/server";
import { configStatus } from "@/lib/env";
import { store } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    config: configStatus(),
    campaigns: store.listCampaigns().map((c) => ({
      id: c.id,
      companyName: c.company_name,
      status: c.status,
      createdAt: c.created_at,
    })),
  });
}
