"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { markNotificationRead, markAllNotificationsRead, getMyNotifications } from "@/lib/actions";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
};

// Polls every 20s so a badge shows up while you're already sitting on a
// page — there's no websocket/push here, so this is the "live enough"
// version of a ring. A previously-unseen unread notification also fires a
// native browser Notification (if the user has granted permission) so it's
// noticeable even when the tab isn't focused.
const POLL_MS = 20000;

export default function NotificationBell({ initial }: { initial: NotificationItem[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const seenIds = useRef(new Set(initial.map((n) => n.id)));
  const unreadCount = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const interval = setInterval(async () => {
      try {
        const fresh = await getMyNotifications();
        const newlySeen = fresh.filter((n) => !seenIds.current.has(n.id));
        for (const n of newlySeen) {
          seenIds.current.add(n.id);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(n.title, { body: n.body });
          }
        }
        setItems(fresh);
      } catch {
        // Silently skip — next poll will retry.
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, []);

  function handleOpen() {
    setOpen((o) => !o);
  }

  async function handleItemClick(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await markNotificationRead(id);
  }

  async function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={handleMarkAll} className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">Nothing yet.</p>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n.id)}
                  className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40 ${
                    n.read ? "" : "bg-indigo-50/50 dark:bg-indigo-950/20"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{n.body}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(n.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
