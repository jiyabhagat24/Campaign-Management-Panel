import { fake } from "./setup";

// One campaign, one onboarded creator, and one person per role.
export function seed() {
  const db = fake._db;
  for (const k of Object.keys(db)) (db as any)[k].length = 0;
  db.users.push(
    { id: "cxo", name: "Suraj", role: "CXO" },
    { id: "cm", name: "Disha", role: "CAMPAIGN_MANAGER" },
    { id: "cm2", name: "Prapti", role: "CAMPAIGN_MANAGER" },
    { id: "ire", name: "Aditya", role: "IR_EXECUTIVE" },
    { id: "fin", name: "Neha", role: "FINANCE" },
    { id: "bd", name: "Dia", role: "BUSINESS_DEVELOPMENT" },
  );
  db.campaigns.push({ id: "c1", name: "Better Water", brand: "Atomberg" });
  db.members.push(
    { campaignId: "c1", userId: "cm", roleOnCampaign: "CAMPAIGN_MANAGER" },
    { campaignId: "c1", userId: "ire", roleOnCampaign: "IR_EXECUTIVE" },
  );
  db.creators.push({ id: "cr1", name: "Kabir Shah", campaignId: "c1", status: "ONBOARDED" });
  return db;
}
