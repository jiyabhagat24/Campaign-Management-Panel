import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { isClient } from "@/lib/rbac";
import { loadCampaignViewGrowth } from "@/lib/viewHistory";

// Data for the Campaign Report's Viewership Growth Graph. Same access rule
// as the report download next door: any internal user, or a client with
// clientAccess to this campaign. Views only — no cost figures.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, clientAccess: { select: { clientId: true } } },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isClient(user.role) && !campaign.clientAccess.some((a) => a.clientId === user.id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await loadCampaignViewGrowth(id));
}
