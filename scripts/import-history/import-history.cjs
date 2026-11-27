// Historical sheet import (2026-11-27).
// Run from the campaign-management-panel folder:
//   node scripts/import-history/import-history.cjs            -> dry run, writes nothing
//   node scripts/import-history/import-history.cjs --apply    -> writes, logs created ids
//   node scripts/import-history/import-history.cjs --rollback -> deletes campaigns listed in the log
// Optional: --skip=C004,C017  (campaign codes to leave out)
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require(path.join(process.cwd(), "node_modules/@prisma/client"));
const p = new PrismaClient();
const DIR = __dirname;
const plan = JSON.parse(fs.readFileSync(path.join(DIR, "plan.json"), "utf8"));
const LOG = path.join(DIR, "import-log.json");
const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const skipArg = process.argv.find((a) => a.startsWith("--skip="));
const SKIP = new Set(skipArg ? skipArg.slice(7).split(",").map((s) => s.trim()) : []);
const CREATED_BY_EMAIL = process.env.IMPORT_CREATED_BY_EMAIL || "jiya.bhagat@theboredmonkey.com";

const d = (s) => (s ? new Date(s + "T00:00:00+05:30") : null);
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function rollback() {
  if (!fs.existsSync(LOG)) return console.log("No import-log.json, nothing to roll back.");
  const log = JSON.parse(fs.readFileSync(LOG, "utf8"));
  const ids = log.created.map((c) => c.id);
  const r = await p.campaign.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${r.count} imported campaigns (creators, deliverables and briefs cascade).`);
}

async function main() {
  if (ROLLBACK) return rollback();
  const users = await p.user.findMany({ select: { id: true, name: true, email: true, role: true } });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const findUser = (ref) => {
    if (!ref) return null;
    const r = ref.trim().toLowerCase();
    if (byEmail.has(r)) return byEmail.get(r);
    // same mailbox on the other TBM domain (.com vs .in)
    const local = r.split("@")[0];
    if (r.includes("@")) {
      const m = users.filter((u) => u.email.toLowerCase().split("@")[0] === local);
      if (m.length === 1) return m[0];
    }
    const m = users.filter((u) => u.role !== "CLIENT" && u.name.toLowerCase().split(/\s+/)[0] === r.split(/[\s@.]/)[0]);
    return m.length === 1 ? m[0] : null;
  };
  const creator = byEmail.get(CREATED_BY_EMAIL.toLowerCase());
  console.log(`Users in panel: ${users.length}. Created-by account: ${creator ? creator.name + " <" + creator.email + ">" : "NOT FOUND (" + CREATED_BY_EMAIL + ")"}`);

  const existing = await p.campaign.findMany({
    select: { id: true, name: true, brand: true, status: true, createdAt: true, creators: { select: { channelHandle: true, name: true } } },
  });
  console.log(`Existing campaigns in panel: ${existing.length}`);
  for (const e of existing) console.log(`  - ${e.name} | ${e.brand} | ${e.status} | ${e.createdAt.toISOString().slice(0, 10)} | ${e.creators.length} creators`);

  const report = [];
  const pocMissing = new Set();
  for (const c of plan.campaigns) {
    const handles = new Set(c.creators.map((x) => norm(x.channelHandle)));
    const dupes = existing.filter((e) => {
      const sameName = norm(e.name) === norm(c.name) && norm(e.brand) === norm(c.brand);
      const brandish = norm(e.brand).includes(norm(c.brand).slice(0, 5)) || norm(c.brand).includes(norm(e.brand).slice(0, 5));
      const overlap = e.creators.filter((x) => handles.has(norm(x.channelHandle)) || handles.has(norm(x.name))).length;
      return sameName || (brandish && overlap >= 2);
    });
    for (const x of c.creators) if (x.pocRef && !findUser(x.pocRef)) pocMissing.add(x.pocRef);
    report.push({ code: c.code, name: c.name, dupes: dupes.map((e) => `${e.name} (${e.creators.length} creators)`) });
  }
  console.log("\nPOSSIBLE DUPLICATES (sheet code -> existing panel campaign):");
  for (const r of report) if (r.dupes.length) console.log(`  ${r.code} ${r.name} -> ${r.dupes.join("; ")}`);
  console.log("\nPOC names/emails not found in Users:", [...pocMissing].join(", ") || "none");

  if (!APPLY) {
    console.log("\nDRY RUN ONLY. Nothing written.");
    return;
  }
  if (!creator) throw new Error("Created-by account not found; set IMPORT_CREATED_BY_EMAIL");
  if (fs.existsSync(LOG)) throw new Error("import-log.json already exists; an import already ran. Roll back first or move the log.");

  const created = [];
  for (const c of plan.campaigns) {
    if (SKIP.has(c.code)) { console.log(`skip ${c.code}`); continue; }
    const start = d(c.startDate);
    const teamUserIds = new Map();
    const camp = await p.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: c.name, brand: c.brand, brief: c.brief, status: c.status, stage: c.status === "CLOSED" ? "REPORT" : "GO_LIVE",
          businessType: c.businessType, campaignType: c.campaignType, campaignObjective: c.campaignObjective, targetAudience: c.targetAudience,
          budgetQuoted: c.budgetQuoted, startDate: start, endDate: d(c.endDate), shortlistingDeadline: d(c.shortlistingDeadline),
          clientWebsiteUrl: c.clientWebsiteUrl, productCategory: c.productCategory, sku: c.sku,
          productUrl: c.productUrls[0] || null, productUrls: c.productUrls.length ? JSON.stringify(c.productUrls) : null,
          financeFeeType: c.financeFeeType, financeAgencyFeePercent: c.financeAgencyFeePercent,
          platformMix: [...new Set(c.platformBriefs.map((b) => b.platform))].join(", ") || null,
          createdById: creator.id, createdAt: start || undefined,
        },
      });
      for (const b of c.platformBriefs) {
        await tx.campaignPlatformBrief.create({
          data: {
            campaignId: campaign.id, platform: b.platform, category: b.category, deliverables: b.deliverables,
            budgetPerCreatorMin: b.budgetPerCreatorMin, budgetPerCreatorMax: b.budgetPerCreatorMax,
            totalCreatorsRequired: b.languages.reduce((s, l) => s + l.creatorsRequired, 0) || null,
            languageRequirements: { create: b.languages },
          },
        });
      }
      for (const x of c.creators) {
        const poc = findUser(x.pocRef);
        if (poc) teamUserIds.set(poc.id, poc.role);
        const pay = x.payout || {};
        const cr = await tx.creator.create({
          data: {
            campaignId: campaign.id, name: x.name, channelHandle: x.channelHandle, profileUrl: x.profileUrl, youtubeUrl: x.youtubeUrl,
            platformPrimary: x.platformPrimary, category: x.category, language: x.language, location: x.location,
            contactPhone: x.contactPhone, contactEmail: x.contactEmail,
            internalCost: x.internalCost, quotedCost: x.quotedCost, quotedCostPublished: x.quotedCostPublished || x.status === "ONBOARDED",
            clientIntent: x.clientIntent, clientCounterCost: x.clientCounterCost, clientRemark: x.clientRemark,
            finalQuotedCost: x.finalQuotedCost, clientFinalIntent: x.clientFinalIntent,
            status: x.status, onboardedAt: d(x.onboardedAt), commercialsLocked: x.status === "ONBOARDED",
            pocUserId: poc ? poc.id : null, goLiveDeadline: d(x.goLiveDeadline),
            rightsOfUsage: x.rightsOfUsage, usageDurationDays: x.usageDurationDays,
            pricingQueueEnteredAt: x.internalCost != null ? start : null,
            payoutInvoiceRaised: !!pay.invoiceRaised, payoutInvoiceReceived: !!pay.invoiceReceived,
            payoutPaymentStatus: pay.status || "NOT_STARTED", payoutAdvance: pay.advance || null, payoutRemark: pay.remark || null,
            createdAt: start || undefined,
          },
        });
        const made = [];
        for (const dl of x.deliverables) {
          const row = await tx.deliverable.create({
            data: {
              creatorId: cr.id, platform: dl.platform, title: dl.title, status: dl.status,
              productStatus: dl.productStatus || null, productEta: d(dl.productEta), scriptDocUrl: dl.scriptDocUrl || null,
              scriptStatus: dl.scriptStatus || null, scriptApprovalDeadline: d(dl.scriptApprovalDeadline),
              scriptApprovedAt: dl.scriptStatus === "APPROVED" ? d(dl.liveDate) || start : null,
              contentStatus: dl.contentStatus || null, contentApprovedAt: dl.contentStatus === "APPROVED" ? d(dl.liveDate) || start : null,
              reviewLink: dl.reviewLink || null, videoDraftDeadline: d(dl.videoDraftDeadline),
              liveLink: dl.liveLink || null, liveDate: d(dl.liveDate),
              views: dl.views ?? 0, likes: dl.likes ?? 0, comments: dl.comments ?? 0,
              createdAt: start || undefined,
            },
          });
          made.push({ type: dl.type, id: row.id, used: false });
        }
        for (const t of x.shortlistTypes) {
          const m = made.find((r) => r.type === t && !r.used);
          if (m) m.used = true;
          await tx.shortlistDeliverable.create({ data: { creatorId: cr.id, deliverableType: t, executionDeliverableId: m ? m.id : null } });
        }
      }
      for (const [userId, role] of teamUserIds) {
        await tx.campaignTeamMember.create({ data: { campaignId: campaign.id, userId, roleOnCampaign: role } });
      }
      return campaign;
    }, { timeout: 120000 });
    created.push({ code: c.code, id: camp.id, name: c.name });
    fs.writeFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), created }, null, 1));
    console.log(`created ${c.code} ${c.name} -> ${camp.id}`);
  }
  console.log(`\nDone. ${created.length} campaigns created. Log: ${LOG}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => p.$disconnect());
