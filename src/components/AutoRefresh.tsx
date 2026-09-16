"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Fixes the "I have to refresh the page every time" complaint app-wide.
// Server Actions already call revalidatePath() on write, but that only
// busts the cache for the NEXT request — it does nothing for a tab someone
// already has open (e.g. a Campaign Manager watching a campaign while a
// Client onboards a creator elsewhere). This polls a lightweight
// router.refresh() in the background so every page under (app) picks up
// other people's changes within a few seconds, without a full reload.
//
// Two guards keep this from being disruptive:
//  - Paused while the tab isn't visible (no point refreshing a background tab).
//  - Skipped on any tick where the user currently has a text/number input,
//    textarea, or select focused — refresh mid-keystroke would blow away
//    whatever they haven't blurred/saved yet (most editable cells here are
//    uncontrolled inputs keyed off server-provided defaultValue).
const REFRESH_INTERVAL_MS = 8000;

export default function AutoRefresh() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      const active = document.activeElement;
      const tag = active?.tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditing) return;
      routerRef.current.refresh();
    };

    const id = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
