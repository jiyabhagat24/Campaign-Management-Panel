"use client";

import { useState, useTransition } from "react";
import { updateClientAccount, deleteClientAccount } from "@/lib/actions";
import { Trash2 } from "lucide-react";

export type ClientLoginRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string; // ISO
  brandName: string | null;
  phone: string | null;
  isSelfSignup: boolean;
};

// Client login management (reset password / remove) — moved here from the
// Team page, which now only lists internal staff. Clients create their own
// login at the sign-up page, so there's no "add client" form here; this is
// just upkeep on logins that already exist. Campaign access itself is a
// separate concern, handled by ClientAccessManager further down this page.
export default function ClientLoginsTable({ clients }: { clients: ClientLoginRow[] }) {
  const [rows, setRows] = useState(clients);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name}'s client login? They will no longer be able to sign in.`)) return;
    setPendingId(id);
    setRowError((e) => ({ ...e, [id]: "" }));
    const prev = rows;
    setRows((r) => r.filter((c) => c.id !== id));
    startTransition(async () => {
      try {
        await deleteClientAccount(id);
      } catch (err) {
        setRows(prev);
        setRowError((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Failed to remove." }));
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleResetPassword(id: string, name: string) {
    const password = prompt(`New password for ${name} (min 8 characters):`);
    if (!password) return;
    if (password.length < 8) {
      setRowError((e) => ({ ...e, [id]: "Password needs to be at least 8 characters." }));
      return;
    }
    setPendingId(id);
    setRowError((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      try {
        await updateClientAccount(id, { password });
      } catch (err) {
        setRowError((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Failed to update password." }));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Email</th>
            <th className="px-4 py-2.5">Brand / Phone</th>
            <th className="px-4 py-2.5">Added</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                {c.name}
                {c.isSelfSignup && (
                  <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                    Self sign-up
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{c.email}</td>
              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {c.brandName ?? "—"}
                {c.phone ? ` · ${c.phone}` : ""}
              </td>
              <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleResetPassword(c.id, c.name)}
                    disabled={pendingId === c.id}
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={pendingId === c.id}
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-rose-950/40"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {rowError[c.id] && <p className="mt-1 max-w-[220px] text-right text-[10px] font-medium text-rose-600 dark:text-rose-400">{rowError[c.id]}</p>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No clients yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
