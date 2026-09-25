"use client";

import type { ReactNode } from "react";
import { focusNextFieldOnEnter } from "@/lib/utils";

// Thin client wrapper so a server-action <form> (can't take an onKeyDown
// prop directly from a Server Component) can still use
// focusNextFieldOnEnter — used by the New Campaign page.
export default function EnterMovesFocusForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form action={action} onKeyDown={focusNextFieldOnEnter} className={className}>
      {children}
    </form>
  );
}
