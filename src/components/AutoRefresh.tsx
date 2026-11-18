"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps every open tab in sync with changes other people make, without a
// manual reload.
//
// Server Actions call revalidatePath() on write, but that only affects the
// NEXT request, not a page someone already has open. So each tab polls a
// cheap /api/heartbeat (a write fingerprint, see that route for details) and
// only pays for a real router.refresh() when the fingerprint changes, i.e.
// only when something was actually written somewhere.
//
// router.refresh() re-renders the current page on the server with the
// viewer's own session, so what comes back is filtered by their role exactly
// like a normal page load. Nothing about the change itself is sent to the
// browser by this component.
//
// Guards:
//  - Paused while the tab is hidden. Coming back to the tab (or focusing
//    the window) checks immediately instead of waiting for the next tick.
//  - Never refreshes while the user has a text/number input, textarea,
//    select, or contenteditable focused, since most editable cells here are
//    uncontrolled inputs keyed off server-provided defaultValue and a
//    refresh mid-keystroke would lose what they typed. A change detected
//    while they're typing is remembered and applied as soon as they leave
//    the field, instead of being dropped.
//  - One heartbeat request in flight at a time.
const POLL_INTERVAL_MS = 5000;

function isEditing() {
  const active = document.activeElement;
  const tag = active?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

export default function AutoRefresh() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    // null until the first successful heartbeat. That first response is the
    // baseline and never triggers a refresh by itself.
    let lastSeen: string | null = null;
    // A change arrived while the user was typing; refresh once they stop.
    let pending = false;

    const applyIfPending = () => {
      if (pending && !document.hidden && !isEditing()) {
        pending = false;
        routerRef.current.refresh();
      }
    };

    const tick = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch("/api/heartbeat", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { latest } = (await res.json()) as { latest: string | null };
        if (latest && latest !== lastSeen) {
          const isFirstCheck = lastSeen === null;
          lastSeen = latest;
          if (!isFirstCheck) pending = true;
        }
        applyIfPending();
      } catch {
        // Network hiccup: try again next tick, nothing to surface.
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    // focusout fires before focus lands on the next element, so check on the
    // next frame once document.activeElement has settled.
    const onFocusOut = () => {
      if (pending) requestAnimationFrame(applyIfPending);
    };

    void tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return null;
}
