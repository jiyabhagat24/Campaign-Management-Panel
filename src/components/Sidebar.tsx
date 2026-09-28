"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/constants";
import { canManageTeam, canManageClients, canViewPricingQueue, canViewTimeAnalytics, isClient, isSuperAdmin } from "@/lib/rbac";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell, { type NotificationItem } from "@/components/NotificationBell";
import {
  LayoutDashboard,
  FolderKanban,
  GitMerge,
  Users,
  UserCheck,
  LogOut,
  AlertTriangle,
  PhoneCall,
  CalendarCheck,
  DollarSign,
  Clock,
  Wallet,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { href: "/pipeline", label: "Pipeline", icon: GitMerge },
  // Campaign Manager + IR Manager — Pricing Queue (task #15), see
  // canViewPricingQueue in rbac.ts.
  { href: "/pricing-queue", label: "Pricing Queue", icon: DollarSign, pricingOnly: true },
  // Same audience plus CXO — Step 7's Time Analytics (stage-duration
  // reporting), see canViewTimeAnalytics in rbac.ts.
  { href: "/time-analytics", label: "Time Analytics", icon: Clock, timeAnalyticsOnly: true },
  // Escalations (task #14) and Action Tracker (task #16) — internal-only,
  // not gated to a single role since any internal role can raise/own an
  // escalation and any internal role logs a client chase.
  // Escalations: available to clients too (raise-only, scoped to their own
  // campaigns — see the page and raiseEscalation's assertClientCampaignAccess
  // check), so no internalOnly flag here.
  { href: "/escalations", label: "Escalations", icon: AlertTriangle },
  // Action Tracker: internal-only AND not CXO (Page Permissions matrix marks
  // it Not available for CXO — see actionTrackerBlocked below).
  { href: "/action-tracker", label: "Action Tracker", icon: PhoneCall, internalOnly: true, actionTrackerBlocked: true },
  // CXO-only — the Team admin page (add/re-role/remove logins).
  { href: "/team", label: "Team", icon: Users, teamOnly: true },
  // CXO + Brand Solutions — client login management (reset password/
  // remove) plus grant/revoke which campaigns each client can see.
  // Separate flag from teamOnly (Team page / Month Lock stay CXO-only).
  { href: "/clients", label: "Clients", icon: UserCheck, clientsOnly: true },
  // Same gate as Clients — Step 28's Client Cash invoicing worklist.
  { href: "/client-cash", label: "Client Cash", icon: Wallet, clientsOnly: true },
  // CXO-only — month lock (task #17 / spec Gate G12).
  { href: "/admin/months", label: "Month Lock", icon: CalendarCheck, teamOnly: true },
];

export default function Sidebar({ role, name, notifications, userId }: { role: Role; name: string; notifications: NotificationItem[]; userId?: string }) {
  const pathname = usePathname();
  const superAdmin = isSuperAdmin(userId);

  const getRoleBadgeColor = (r: Role) => {
    switch (r) {
      case "CLIENT":
        return "bg-emerald-950/50 text-emerald-300 border-emerald-800/60";
      case "CXO":
        return "bg-rose-950/50 text-rose-300 border-rose-800/60";
      case "BRAND_SOLUTIONS":
        return "bg-indigo-900/50 text-indigo-300 border-indigo-700/60";
      case "CAMPAIGN_MANAGER":
        return "bg-violet-950/50 text-violet-300 border-violet-800/60";
      default:
        return "bg-amber-950/50 text-amber-300 border-amber-800/60";
    }
  };

  const filteredNav = NAV.filter((item) => {
    if (superAdmin) return true;
    if (role === "CLIENT" && (item.href === "/pipeline" || item.href === "/dashboard")) return false;
    if ("teamOnly" in item && item.teamOnly && !canManageTeam(role)) return false;
    if ("clientsOnly" in item && item.clientsOnly && !canManageClients(role)) return false;
    if ("internalOnly" in item && item.internalOnly && isClient(role)) return false;
    if ("actionTrackerBlocked" in item && item.actionTrackerBlocked && role === "CXO") return false;
    if ("pricingOnly" in item && item.pricingOnly && !canViewPricingQueue(role)) return false;
    if ("timeAnalyticsOnly" in item && item.timeAnalyticsOnly && !canViewTimeAnalytics(role)) return false;
    return true;
  });

  // Sidebar stays permanently dark (slate-900/800/700, now the Deep Indigo
  // palette) regardless of the light/dark toggle — only the main content
  // area (in AppLayout) switches between the light and dark themes. A
  // persistent dark shell around a toggleable light/dark workspace. Uses
  // slate/indigo tokens throughout (not hardcoded hex) so swapping the
  // palette in tailwind.config.ts is enough to restyle this too.
  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-slate-700 bg-slate-900 transition-colors">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo-dark.png" alt="TheBoredMonkey" className="h-20 w-auto max-w-full object-contain" />
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <NotificationBell initial={notifications} />
          <ThemeToggle />
        </div>
      </div>

      {/* Navigation — min-h-0 is required alongside flex-1 for a flex child
          to actually shrink and scroll instead of stretching the sidebar
          (and pushing the footer user card off-screen) as more nav items
          get added over time. Header/footer stay fixed; only this list
          scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Main Navigation
        </p>
        <nav className="space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 shadow-xs font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-50"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-indigo-600" />
                )}
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-200"
                  }`}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer User Card */}
      <div className="border-t border-slate-700 p-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 font-bold text-indigo-400 text-xs">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-50">{name}</p>
              <span
                className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getRoleBadgeColor(
                  role
                )}`}
              >
                {role.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          <a
            href="/api/auth/signout"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-2 text-xs font-medium text-slate-400 shadow-xs transition-colors hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-800/60"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </a>
        </div>
      </div>
    </aside>
  );
}
