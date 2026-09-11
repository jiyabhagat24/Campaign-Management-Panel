"use client";

import { useState, useTransition } from "react";
import { createTeamUser, updateTeamUserRole, deleteTeamUser, setTeamUserPassword } from "@/lib/actions";
import { INTERNAL_ROLES, type Role } from "@/lib/constants";
import { UserPlus, Trash2, KeyRound } from "lucide-react";

const ROLE_LABEL: Record<Role, string> = {
  CXO: "CXO",
  BRAND_SOLUTIONS: "Brand Solutions",
  CAMPAIGN_MANAGER: "Campaign Manager",
  IR_MANAGER: "IR Manager",
  IR_EXECUTIVE: "IR Executive",
  IR_INTERN: "IR Intern",
  CLIENT: "Client",
};

const ROLE_BADGE: Record<Role, string> = {
  CXO: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  BRAND_SOLUTIONS: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  CAMPAIGN_MANAGER: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  IR_MANAGER: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  IR_EXECUTIVE: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  IR_INTERN: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  CLIENT: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

type TeamUser = { id: string; name: string; email: string; role: string; createdAt: string };

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border-0 px-2 py-1 text-[11px] font-bold outline-none disabled:opacity-50 ${ROLE_BADGE[value as Role] ?? ROLE_BADGE.CXO}`}
    >
      {INTERNAL_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

// Inline "give this person a password" control — optional, on top of their
// Google sign-in. See setTeamUserPassword in actions.ts for why handing out
// a password here is safe (only an account explicitly given one this way
// can ever use the Credentials login door).
function PasswordControl({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setTeamUserPassword(userId, value);
        setValue("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set password.");
      }
    });
  }

  function clear() {
    if (!confirm("Remove this person's password? They'll go back to Google sign-in only.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await setTeamUserPassword(userId, null);
        setValue("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove password.");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <KeyRound className="h-3 w-3" />
          Set password
        </button>
        <button onClick={clear} disabled={pending} className="text-[11px] font-medium text-slate-400 hover:underline disabled:opacity-50">
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="password"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New password"
        className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <button onClick={save} disabled={pending} className="rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        Save
      </button>
      <button
        onClick={() => { setOpen(false); setValue(""); setError(null); }}
        className="text-[11px] font-medium text-slate-400 hover:underline"
      >
        Cancel
      </button>
      {error && <p className="text-[10px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

function AddTeamMemberForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("IR_EXECUTIVE");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setRole("IR_EXECUTIVE");
    setError(null);
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createTeamUser({ name, email, role });
        reset();
        onAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add team member.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        <UserPlus className="h-4 w-4" />
        Add team member
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Full name"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="name@theboredmonkey.com"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {INTERNAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Signs in with their own theboredmonkey.com Google account — you can optionally give them a password too
        after adding them.
      </p>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TeamManagementClient({
  users,
  currentUserId,
}: {
  users: TeamUser[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(users);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function handleRoleChange(id: string, role: string) {
    setPendingId(id);
    setRowError((e) => ({ ...e, [id]: "" }));
    const prev = rows;
    setRows((r) => r.map((u) => (u.id === id ? { ...u, role } : u)));
    startTransition(async () => {
      try {
        await updateTeamUserRole(id, role);
      } catch (err) {
        setRows(prev);
        setRowError((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Failed to update role." }));
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name}'s login? They will no longer be able to sign in.`)) return;
    setPendingId(id);
    setRowError((e) => ({ ...e, [id]: "" }));
    const prev = rows;
    setRows((r) => r.filter((u) => u.id !== id));
    startTransition(async () => {
      try {
        await deleteTeamUser(id);
      } catch (err) {
        setRows(prev);
        setRowError((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Failed to remove." }));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* ---------- Internal team (User table) ---------- */}
      <section className="space-y-5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Internal team
          </h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">TheBoredMonkey staff sign in with Google by default — optionally give someone a password too (e.g. for testing a role, or if they can't use Google).</p>
        </div>

        <AddTeamMemberForm onAdded={() => window.location.reload()} />

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Password</th>
                <th className="px-4 py-2.5">Added</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {u.name} {u.id === currentUserId && <span className="text-[10px] font-normal text-slate-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <RoleSelect value={u.role} onChange={(role) => handleRoleChange(u.id, role)} />
                    {rowError[u.id] && <p className="mt-1 max-w-[220px] text-[10px] font-medium text-rose-600 dark:text-rose-400">{rowError[u.id]}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <PasswordControl userId={u.id} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        disabled={pendingId === u.id}
                        className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-rose-950/40"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
