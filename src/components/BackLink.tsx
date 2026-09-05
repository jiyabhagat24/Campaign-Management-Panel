"use client";

import { useRouter } from "next/navigation";

// Goes back to whatever page actually linked here (the campaign page, the
// communications list, etc.) instead of a hardcoded destination — so it
// behaves the way "back" should regardless of where the user came from.
export default function BackLink({ label, fallbackHref }: { label: string; fallbackHref: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      ← {label}
    </button>
  );
}
