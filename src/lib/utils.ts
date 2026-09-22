import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui helper — merges conditional class lists (clsx) and
// then dedupes/resolves conflicting Tailwind utility classes (tailwind-merge),
// e.g. cn("px-2", condition && "px-4") correctly keeps only "px-4" instead of
// emitting both and letting source order decide. Needed by src/components/ui/chart.tsx.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
