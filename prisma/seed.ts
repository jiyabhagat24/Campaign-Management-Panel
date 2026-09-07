import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash("password123", 10);

  const cxo = await prisma.user.upsert({
    where: { email: "vikram@theboredmonkey.com" },
    update: {},
    create: { name: "Vikram Rao", email: "vikram@theboredmonkey.com", passwordHash: pw, role: "CXO" },
  });
  const brandSolutions = await prisma.user.upsert({
    where: { email: "priya@theboredmonkey.com" },
    update: {},
    create: { name: "Priya Shah", email: "priya@theboredmonkey.com", passwordHash: pw, role: "BRAND_SOLUTIONS" },
  });
  const campaignManager = await prisma.user.upsert({
    where: { email: "arjun@theboredmonkey.com" },
    update: {},
    create: { name: "Arjun Mehta", email: "arjun@theboredmonkey.com", passwordHash: pw, role: "CAMPAIGN_MANAGER" },
  });
  const irManager = await prisma.user.upsert({
    where: { email: "neha@theboredmonkey.com" },
    update: {},
    create: { name: "Neha Kapoor", email: "neha@theboredmonkey.com", passwordHash: pw, role: "IR_MANAGER" },
  });
  const irExecutive = await prisma.user.upsert({
    where: { email: "rahul@theboredmonkey.com" },
    update: {},
    create: { name: "Rahul Singh", email: "rahul@theboredmonkey.com", passwordHash: pw, role: "IR_EXECUTIVE" },
  });
  const irIntern = await prisma.user.upsert({
    where: { email: "kabir@theboredmonkey.com" },
    update: {},
    create: { name: "Kabir Anand", email: "kabir@theboredmonkey.com", passwordHash: pw, role: "IR_INTERN" },
  });
  const client = await prisma.client.upsert({
    where: { email: "aman@brand.com" },
    update: {},
    create: { name: "Aman (Client)", email: "aman@brand.com", passwordHash: pw },
  });

  const campaign = await prisma.campaign.create({
    data: {
      name: "Skincare Launch",
      brand: "Nykaa",
      brief: "Launch campaign for the new vitamin-C serum. Mix of YouTube long-form reviews and Instagram Reels. Mandatory: unboxing shot, 60s minimum on-camera product use.",
      status: "ACTIVE",
      stage: "CONTENT",
      budgetQuoted: 1600000,
      platformMix: "YouTube, Instagram",
      startDate: new Date("2026-07-01"),
      goLiveDeadline: new Date("2026-08-20"),
      createdById: brandSolutions.id,
      clientAccess: { create: { clientId: client.id } },
      teamMembers: {
        create: [
          { userId: brandSolutions.id, roleOnCampaign: "BRAND_SOLUTIONS" },
          { userId: campaignManager.id, roleOnCampaign: "CAMPAIGN_MANAGER" },
          { userId: irManager.id, roleOnCampaign: "IR_MANAGER" },
          { userId: irExecutive.id, roleOnCampaign: "IR_EXECUTIVE" },
          { userId: irIntern.id, roleOnCampaign: "IR_INTERN" },
        ],
      },
    },
  });

  const glowWithRiya = await prisma.creator.create({
    data: {
      campaignId: campaign.id,
      name: "GlowWithRiya",
      channelHandle: "@GlowWithRiya",
      platformPrimary: "YOUTUBE_LONG",
      followers: 1200000,
      avgViews: 450000,
      engagementRate: 5.8,
      category: "Beauty",
      internalCost: 120000,
      quotedCost: 180000,
      status: "ONBOARDED",
      onboardedAt: new Date("2026-07-10"),
      commercialsLocked: true,
      negotiationRounds: {
        create: [
          { roundNumber: 1, proposedCost: 220000, proposedBy: "CLIENT", note: "Too high for scope" },
          { roundNumber: 2, proposedCost: 190000, proposedByUserId: campaignManager.id, proposedBy: campaignManager.id, note: "Countered with reduced deliverables" },
          { roundNumber: 3, proposedCost: 180000, proposedBy: "CLIENT", note: "Accepted" },
        ],
      },
      deliverables: {
        create: [
          {
            platform: "YOUTUBE_LONG",
            title: "In-depth Vitamin C Serum Review",
            status: "CONTENT_APPROVED",
            productStatus: "DELIVERED",
            scriptStatus: "APPROVED",
            scriptApprovedAt: new Date("2026-07-15"),
            contentStatus: "APPROVED",
            contentApprovedAt: new Date("2026-07-28"),
          },
        ],
      },
    },
  });

  const skinTalks = await prisma.creator.create({
    data: {
      campaignId: campaign.id,
      name: "SkinTalks",
      channelHandle: "@SkinTalks",
      platformPrimary: "INSTAGRAM_REEL",
      followers: 850000,
      avgViews: 120000,
      engagementRate: 7.2,
      category: "Beauty",
      internalCost: 80000,
      quotedCost: 120000,
      status: "ONBOARDED",
      onboardedAt: new Date("2026-07-12"),
      commercialsLocked: true,
      deliverables: {
        create: [
          { platform: "INSTAGRAM_REEL", title: "Get Ready With Me — Serum Edition", status: "IN_SHOOT", productStatus: "DELIVERED", scriptStatus: "APPROVED", scriptApprovedAt: new Date("2026-07-18") },
        ],
      },
    },
  });

  const beautyByK = await prisma.creator.create({
    data: {
      campaignId: campaign.id,
      name: "BeautyByK",
      channelHandle: "@BeautyByK",
      platformPrimary: "YOUTUBE_LONG",
      followers: 560000,
      avgViews: 180000,
      engagementRate: 4.9,
      category: "Beauty",
      internalCost: 60000,
      quotedCost: 90000,
      status: "CLIENT_LIKED",
    },
  });

  const glowUpOfficial = await prisma.creator.create({
    data: {
      campaignId: campaign.id,
      name: "GlowUpOfficial",
      channelHandle: "@GlowUpOfficial",
      platformPrimary: "INSTAGRAM_REEL",
      followers: 320000,
      avgViews: 80000,
      engagementRate: 6.1,
      category: "Beauty",
      internalCost: 40000,
      quotedCost: 60000,
      status: "REJECTED",
      rejectionReason: "Audience skew doesn't match target demographic",
    },
  });

  await prisma.remark.createMany({
    data: [
      {
        campaignId: campaign.id,
        creatorId: skinTalks.id,
        authorClientId: client.id,
        authorRoleSnapshot: "CLIENT",
        body: "Please include more creators from tier 2 cities.",
        visibility: "CLIENT",
        createdAt: new Date("2026-07-10T11:30:00Z"),
      },
      {
        campaignId: campaign.id,
        creatorId: skinTalks.id,
        authorId: irExecutive.id,
        authorRoleSnapshot: "IR_EXECUTIVE",
        body: "Noted. Adding 3 more creators from tier 2 to the shortlist.",
        visibility: "CLIENT",
        createdAt: new Date("2026-07-10T11:45:00Z"),
      },
    ],
  });

  await prisma.activityLog.createMany({
    data: [
      { campaignId: campaign.id, actorId: brandSolutions.id, actorName: brandSolutions.name, action: "CAMPAIGN_CREATED", entityType: "Campaign", entityId: campaign.id },
      { campaignId: campaign.id, actorId: irExecutive.id, actorName: irExecutive.name, action: "CREATOR_ADDED", entityType: "Creator", entityId: glowWithRiya.id },
      { campaignId: campaign.id, actorClientId: client.id, actorName: client.name, action: "CREATOR_APPROVED_ONBOARD", entityType: "Creator", entityId: glowWithRiya.id },
    ],
  });

  await prisma.scoutedCreator.createMany({
    data: [
      { name: "TinyCityBeauty", handle: "@tinycitybeauty", platform: "INSTAGRAM_REEL", followers: 95000, avgViews: 22000, engagementRate: 8.4, niche: "Beauty, Tier-2", score: 82, status: "QUALIFIED", source: "DATA_PROVIDER" },
      { name: "DermDiaries", handle: "@dermdiaries", platform: "YOUTUBE_LONG", followers: 210000, avgViews: 60000, engagementRate: 5.1, niche: "Skincare science", score: 76, status: "NEW", source: "MANUAL_IMPORT" },
      { name: "GlamNGo", handle: "@glamngo", platform: "INSTAGRAM_REEL", followers: 45000, avgViews: 9000, engagementRate: 3.2, niche: "Beauty", score: 41, status: "NEW", source: "DATA_PROVIDER" },
    ],
  });

  console.log("Seed complete. Demo logins (password: password123):");
  console.log("  Brand Solutions : priya@theboredmonkey.com");
  console.log("  Campaign Manager: arjun@theboredmonkey.com");
  console.log("  IR Manager      : neha@theboredmonkey.com");
  console.log("  IR Executive    : rahul@theboredmonkey.com");
  console.log("  Client          : aman@brand.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
