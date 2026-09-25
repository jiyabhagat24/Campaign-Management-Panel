import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { KeyboardEvent } from "react";

// Standard shadcn/ui helper — merges conditional class lists (clsx) and
// then dedupes/resolves conflicting Tailwind utility classes (tailwind-merge),
// e.g. cn("px-2", condition && "px-4") correctly keeps only "px-4" instead of
// emitting both and letting source order decide. Needed by src/components/ui/chart.tsx.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Multi-field forms (New Campaign, Edit Campaign) submit — and, for New
// Campaign, redirect straight to the campaign page — on a stray Enter
// keypress in an early field, since that's the browser's default for any
// input inside a <form>. This intercepts Enter and moves focus to the next
// field instead, so only the actual submit button saves. Textareas keep
// Enter as a newline; buttons keep it as a click.
export function focusNextFieldOnEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") return;
  const target = e.target as HTMLElement;
  if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
  e.preventDefault();
  const focusable = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    )
  ).filter((el) => el.offsetParent !== null);
  const next = focusable[focusable.indexOf(target) + 1];
  next?.focus();
}
