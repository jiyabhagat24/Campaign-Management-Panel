import { Check, X, CircleDot } from "lucide-react";
import { ROLES, type Role } from "@/lib/constants";

// Static reference table for CXO — mirrors the real gates in src/lib/rbac.ts
// exactly (canSeeInternalCost, canSetCommercials, canViewPricingQueue,
// isCreatorPOC, canOperateShortlist, canCreateCampaign, canDeleteCampaign,
// canManageClients, canManageTeam, campaignVisibilityWhere/isOrgWide). This
// is read-only and intentionally not wired to anything — access control
// itself lives in code (rbac.ts), not in a database table an admin could
// edit from a screen like this one. Tickboxes here would silently do
// nothing if they were interactive, which is worse than not having them —
// so this renders as a fixed audit view: change what a role can do by
// editing rbac.ts, then update this table to match.
const ROLE_LABEL: Record<Role, string> = {
  CXO: "CXO",
  BRAND_SOLUTIONS: "Brand Solutions",
  CAMPAIGN_MANAGER: "Campaign Manager",
  IR_MANAGER: "IR Manager",
  IR_EXECUTIVE: "IR Executive",
  IR_INTERN: "IR Intern",
  CLIENT: "Client",
};

type Level = "full" | "partial" | "none";

type Cell = { level: Level; note?: string };

type Row = {
  area: string;
  cells: Record<Role, Cell>;
};

const full = (note?: string): Cell => ({ level: "full", note });
const partial = (note: string): Cell => ({ level: "partial", note });
const none = (note?: string): Cell => ({ level: "none", note });

const ROWS: Row[] = [
  {
    area: "Campaign visibility",
    cells: {
      CXO: full("All, org-wide"),
      BRAND_SOLUTIONS: partial("Own campaigns only"),
      CAMPAIGN_MANAGER: partial("Own campaigns only"),
      IR_MANAGER: full("All, org-wide"),
      IR_EXECUTIVE: partial("Own campaigns only"),
      IR_INTERN: partial("Own campaigns only"),
      CLIENT: partial("Own, via client access"),
    },
  },
  {
    area: "Internal cost / margin / Agency Fee / Client Invoice status",
    cells: {
      CXO: full(),
      BRAND_SOLUTIONS: full(),
      CAMPAIGN_MANAGER: full(),
      IR_MANAGER: full(),
      IR_EXECUTIVE: full(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
  {
    area: "Set Commercials (Quoted / Final Cost)",
    cells: {
      CXO: partial("View only"),
      BRAND_SOLUTIONS: partial("View only"),
      CAMPAIGN_MANAGER: full(),
      IR_MANAGER: partial("View only"),
      IR_EXECUTIVE: none(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
  {
    area: "Pricing Queue page",
    cells: {
      CXO: none(),
      BRAND_SOLUTIONS: none(),
      CAMPAIGN_MANAGER: full(),
      IR_MANAGER: partial("View only"),
      IR_EXECUTIVE: none(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
  {
    area: "Onboarded-table execution (status, links, deadlines, pause)",
    cells: {
      CXO: none(),
      BRAND_SOLUTIONS: none(),
      CAMPAIGN_MANAGER: partial("Deadline / SPOC / pause-confirm only"),
      IR_MANAGER: none(),
      IR_EXECUTIVE: partial("Only if assigned as that creator's POC"),
      IR_INTERN: partial("Only if assigned as that creator's POC"),
      CLIENT: none(),
    },
  },
  {
    area: "Shortlisting: create / edit rows",
    cells: {
      CXO: none("Not available"),
      BRAND_SOLUTIONS: partial("View published rows only"),
      CAMPAIGN_MANAGER: partial("Vet, price and publish only"),
      IR_MANAGER: partial("View all rows"),
      IR_EXECUTIVE: partial("Own + assigned Intern's rows"),
      IR_INTERN: partial("Own rows only"),
      CLIENT: none(),
    },
  },
  {
    area: "Create campaign",
    cells: {
      CXO: none(),
      BRAND_SOLUTIONS: full(),
      CAMPAIGN_MANAGER: none(),
      IR_MANAGER: none(),
      IR_EXECUTIVE: none(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
  {
    area: "Delete campaign",
    cells: {
      CXO: full(),
      BRAND_SOLUTIONS: full(),
      CAMPAIGN_MANAGER: none(),
      IR_MANAGER: none(),
      IR_EXECUTIVE: none(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
  {
    area: "Manage Clients page",
    cells: {
      CXO: full(),
      BRAND_SOLUTIONS: full(),
      CAMPAIGN_MANAGER: none(),
      IR_MANAGER: none(),
      IR_EXECUTIVE: none(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
  {
    area: "Manage Team (Users)",
    cells: {
      CXO: full(),
      BRAND_SOLUTIONS: none(),
      CAMPAIGN_MANAGER: none(),
      IR_MANAGER: none(),
      IR_EXECUTIVE: none(),
      IR_INTERN: none(),
      CLIENT: none(),
    },
  },
];

function CellIcon({ cell }: { cell: Cell }) {
  if (cell.level === "full") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (cell.level === "partial") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
        <CircleDot className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600">
      <X className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  );
}

export default function PermissionsMatrix() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
      <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Role permissions</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Read-only reference, matches the real access checks in code. Green = full access, amber dot = scoped/partial (see note),
          grey = no access.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="sticky left-0 z-10 w-[280px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left dark:border-slate-700 dark:bg-slate-800">
                Area
              </th>
              {ROLES.map((role) => (
                <th key={role} className="w-[130px] whitespace-nowrap border-b border-slate-200 px-3 py-2.5 text-center dark:border-slate-700">
                  {ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.area} className="align-top">
                <td className="sticky left-0 z-10 w-[280px] border-b border-slate-100 bg-white px-4 py-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  {row.area}
                </td>
                {ROLES.map((role) => {
                  const cell = row.cells[role];
                  return (
                    <td key={role} className="border-b border-slate-100 px-3 py-3 text-center dark:border-slate-800">
                      <div className="flex flex-col items-center gap-1">
                        <CellIcon cell={cell} />
                        {cell.note && <span className="text-[10px] leading-tight text-slate-400 dark:text-slate-500">{cell.note}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
