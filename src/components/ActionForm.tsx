"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Fixes the crash-to-blank-screen behavior on Escalations / Action Tracker /
// Pricing Queue / Month Lock: those pages used to hand a Server Action
// straight to <form action={...}>. If the action threw (missing field, wrong
// role, invalid state), there was nothing on the page to catch it — Next.js
// had no error boundary for it, so the whole page just broke. This wraps the
// same server action in a real onSubmit handler so a thrown/returned error
// shows as a plain alert instead, and refreshes the page data on success
// (same "why do I have to refresh manually" fix as everywhere else).
//
// `action` receives the submitted FormData, same signature as the inline
// `action={async (formData) => {"use server"; ...}}` pattern these pages
// used before — swap that prop in as-is, no other call-site changes needed.
export default function ActionForm({
  action,
  className,
  children,
  confirmMessage,
  resetOnSuccess = false,
}: {
  action: (formData: FormData) => Promise<any>;
  className?: string;
  children: React.ReactNode;
  confirmMessage?: string;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const busy = pending || submitting;

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        setSubmitting(true);
        (async () => {
          try {
            const result: any = await action(formData);
            if (result && typeof result === "object" && result.error) {
              window.alert(result.error);
              return;
            }
            if (resetOnSuccess) form.reset();
            startTransition(() => router.refresh());
          } catch (err: any) {
            window.alert(err?.message ?? "Something went wrong — that didn't save.");
          } finally {
            setSubmitting(false);
          }
        })();
      }}
    >
      {children}
    </form>
  );
}
