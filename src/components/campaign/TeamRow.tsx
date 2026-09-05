"use client";

import { useState } from "react";
import { assignTeamMember, removeTeamMember } from "@/lib/actions";
import { ROLES } from "@/lib/constants";

type TeamMember = { id: string; roleOnCampaign: string; user: { id: string; name: string } };
type InternalUser = { id: string; name: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  CXO: "CXO",
  BRAND_SOLUTIONS: "Brand Solutions",
  CAMPAIGN_MANAGER: "Campaign Manager",
  IR_MANAGER: "IR Manager",
  IR_EXECUTIVE: "IR Executive",
  IR_INTERN: "IR Intern",
};

export default function TeamRow({
  campaignId,
  teamMembers,
  internalUsers,
  canEdit,
}: {
  campaignId: string;
  teamMembers: TeamMember[];
  internalUsers: InternalUser[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<string>("IR_EXECUTIVE");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {teamMembers.map((m) => (
        <span key={m.id} className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-400 dark:text-slate-500">{ROLE_LABEL[m.roleOnCampaign] ?? m.roleOnCampaign}:</span>
          <span className="font-medium text-ink dark:text-white">{m.user.name}</span>
          {canEdit && (
            <button
              onClick={() => removeTeamMember(m.id, campaignId)}
              className="ml-0.5 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600"
              title="Remove"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {teamMembers.length === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">No one assigned yet.</span>}

      {canEdit && (
        <>
          {!adding ? (
            <button onClick={() => setAdding(true)} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-400">
              + Assign
            </button>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!userId) return;
                await assignTeamMember(campaignId, userId, role);
                setAdding(false);
                setUserId("");
              }}
              className="flex items-center gap-1.5"
            >
              <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {ROLES.filter((r) => r !== "CLIENT").map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <option value="" disabled>Person...</option>
                {internalUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">Cancel</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
