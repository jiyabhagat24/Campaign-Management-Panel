"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Fixes the "I have to refresh the page every time" complaint app-wide.
// Server Actions already call revalidatePath() on write, but that only
// busts the cache for the NEXT request — it does nothing for a tab someone
// already has open (e.g. a Campaign Manager watching a campaign while a
// Client onboards a creator elsewhere).
//
// This used to call router.refresh() directly on every tick, which reruns
// every Server Component query on the open page for every tab, every 8s —
// at 50 concurrent users that's a large, constant load even when nothing
// changed. It now polls a cheap /api/heartbeat (one indexed row lookup)
// instead, and only pays for the real router.refresh() when the heartbeat
// timestamp actually advances — i.e. only when something genuinely changed
// somewhere in the app since the last check.
//
// Same two guards as before:
//  - Paused while the tab isn't visible (no point checking a background tab).
//  - Skipped on any tick where the user currently has a text/number input,
//    textarea, or select focused — refresh mid-keystroke would blow away
//    whatever they haven't blurred/saved yet (most editable cells here are
//    uncontrolled inputs keyed off server-provided defaultValue).
const POLL_INTERVAL_MS = 8000;

export default function AutoRefresh() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  // null until the first successful heartbeat — that first response is just
  // the baseline, never triggers a refresh (nothing "changed" relative to
  // a baseline we haven't recorded yet).
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      const active = document.activeElement;
      const tag = active?.tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditing) return;

      try {
        const res = await fetch("/api/heartbeat", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { latest } = (await res.json()) as { latest: string | null };
        if (latest && latest !== lastSeen.current) {
          const isFirstCheck = lastSeen.current === null;
          lastSeen.current = latest;
          if (!isFirstCheck) routerRef.current.refresh();
        }
      } catch {
        // Network hiccup — just try again next tick, no need to surface this.
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return null;
}
