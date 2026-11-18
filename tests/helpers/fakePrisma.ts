// Minimal in-memory stand-in for the Prisma client, covering only the calls
// the payment-chain actions and management helpers make. Lets the journey
// tests run with no database. Not a general Prisma emulator.

type Row = Record<string, any>;
let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in v) return v.in.includes(row[k]);
      if ("not" in v) return row[k] !== v.not;
      if ("notIn" in v) return !v.notIn.includes(row[k]);
      return true; // nested relation filters handled by callers
    }
    return row[k] === v;
  });
}

export function createFakePrisma() {
  const db = {
    users: [] as Row[],
    campaigns: [] as Row[],
    members: [] as Row[],
    creators: [] as Row[],
    terms: [] as Row[],
    milestones: [] as Row[],
    invoices: [] as Row[],
    payouts: [] as Row[],
    events: [] as Row[],
    notifications: [] as Row[],
    briefs: [] as Row[],
    briefMessages: [] as Row[],
    deliverables: [] as Row[],
    releases: [] as Row[],
    closures: [] as Row[],
    activity: [] as Row[],
  };

  const prisma: any = {
    _db: db,
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
    user: {
      findUnique: async ({ where }: any) => db.users.find((u) => u.id === where.id) ?? null,
      findMany: async ({ where }: any = {}) => db.users.filter((u) => matches(u, where)),
    },
    campaign: {
      findFirst: async ({ where }: any) => {
        const c = db.campaigns.find((x) => x.id === where.id);
        if (!c) return null;
        const uid = where.teamMembers?.some?.userId;
        if (uid && !db.members.some((m) => m.campaignId === c.id && m.userId === uid)) return null;
        return c;
      },
      findUnique: async ({ where }: any) => prisma._campaignFull(where.id),
      update: async ({ where, data }: any) => Object.assign(db.campaigns.find((x) => x.id === where.id)!, data),
    },
    campaignTeamMember: {
      findMany: async ({ where }: any) => db.members.filter((m) => matches(m, where)),
      findFirst: async ({ where }: any) => db.members.find((m) => matches(m, where)) ?? null,
    },
    creator: {
      findUnique: async ({ where }: any) => db.creators.find((c) => c.id === where.id) ?? null,
    },
    creatorPaymentTerms: {
      findUnique: async ({ where }: any) => db.terms.find((t) => t.creatorId === where.creatorId) ?? null,
      create: async ({ data }: any) => {
        const row = { id: id("terms"), termsVersion: 1, vendorVerified: false, scheduleConfirmedAt: null, ...data };
        db.terms.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.terms.find((t) => t.creatorId === where.creatorId);
        Object.assign(row!, data);
        return row;
      },
    },
    paymentMilestone: {
      deleteMany: async ({ where }: any) => {
        db.milestones = db.milestones.filter((m) => m.creatorId !== where.creatorId);
        return { count: 0 };
      },
      createMany: async ({ data }: any) => {
        for (const d of data) db.milestones.push({ id: id("ms"), ...d });
        return { count: data.length };
      },
      findUnique: async ({ where }: any) => {
        const m = db.milestones.find((x) => x.id === where.id);
        return m ? { ...m, payouts: db.payouts.filter((p) => p.milestoneId === m.id) } : null;
      },
      findMany: async ({ where }: any) =>
        db.milestones
          .filter((m) => where.creatorId.in.includes(m.creatorId) && (!m.dueDate || m.dueDate <= where.dueDate.lte))
          .map((m) => ({ ...m, payouts: db.payouts.filter((p) => p.milestoneId === m.id) })),
    },
    creatorPayout: {
      count: async ({ where }: any) =>
        db.payouts.filter((p) => db.milestones.some((m) => m.id === p.milestoneId && m.creatorId === where.milestone.creatorId)).length,
      create: async ({ data }: any) => {
        const row = { id: id("payout"), ...data };
        db.payouts.push(row);
        return row;
      },
    },
    creatorInvoice: {
      create: async ({ data }: any) => {
        const row = { id: id("inv"), status: "RECEIVED", cmApprovedAt: null, approvedTermsVersion: null, ...data };
        db.invoices.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const inv = db.invoices.find((i) => i.id === where.id);
        return inv ? { ...inv, payouts: db.payouts.filter((p) => p.invoiceId === inv.id) } : null;
      },
      update: async ({ where, data }: any) => {
        const row = db.invoices.find((i) => i.id === where.id);
        Object.assign(row!, data);
        return row;
      },
      findMany: async ({ where }: any) =>
        db.invoices
          .filter((i) => where.campaignId.in.includes(i.campaignId) && i.status !== "REJECTED")
          .map((i) => ({ ...i, payouts: db.payouts.filter((p) => p.invoiceId === i.id) })),
    },
    workflowEvent: { create: async ({ data }: any) => db.events.push(data) },
    notification: {
      createMany: async ({ data }: any) => db.notifications.push(...data),
      create: async ({ data }: any) => db.notifications.push(data),
    },
    activityLog: { create: async ({ data }: any) => db.activity.push(data) },
    // ---- gap build: briefs ----
    brief: {
      create: async ({ data }: any) => {
        const row = { id: id("brief"), status: "NEW", ownerId: null, ownerName: null, campaignId: null, receivedAt: new Date(), ...data };
        db.briefs.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => db.briefs.find((b) => b.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = db.briefs.find((b) => b.id === where.id);
        Object.assign(row!, data);
        return row;
      },
    },
    briefMessage: { create: async ({ data }: any) => db.briefMessages.push({ id: id("msg"), ...data }) },
    // ---- gap build: campaign gates ----
    deliverable: {
      findUnique: async ({ where }: any) => {
        const d = db.deliverables.find((x) => x.id === where.id);
        if (!d) return null;
        const cr = db.creators.find((c) => c.id === d.creatorId);
        return { ...d, releases: db.releases.filter((r) => r.deliverableId === d.id), creator: cr };
      },
    },
    deliverableRelease: {
      create: async ({ data }: any) => {
        if (db.releases.some((r) => r.deliverableId === data.deliverableId && r.kind === data.kind)) throw new Error("unique");
        db.releases.push({ id: id("rel"), ...data });
      },
    },
    campaignClosure: {
      upsert: async ({ where, create, update }: any) => {
        const row = db.closures.find((c) => c.campaignId === where.campaignId);
        if (row) Object.assign(row, update);
        else db.closures.push({ ...create });
      },
      update: async ({ where, data }: any) => Object.assign(db.closures.find((c) => c.campaignId === where.campaignId)!, data),
    },
    _campaignFull(cid: string) {
      const c = db.campaigns.find((x) => x.id === cid);
      if (!c) return null;
      return {
        ...c,
        creators: db.creators
          .filter((cr) => cr.campaignId === cid)
          .map((cr) => ({ ...cr, deliverables: db.deliverables.filter((d) => d.creatorId === cr.id) })),
        closure: db.closures.find((x) => x.campaignId === cid) ?? null,
        teamMembers: db.members.filter((m) => m.campaignId === cid),
        clientAccess: c.clientAccess ?? [],
      };
    },
  };
  return prisma;
}
