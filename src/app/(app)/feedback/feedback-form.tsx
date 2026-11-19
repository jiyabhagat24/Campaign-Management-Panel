"use client";

import { useActionState, useEffect, useRef } from "react";
import { postFeedback } from "@/lib/feedbackActions";
import { inputClass, labelClass } from "@/components/gaps/Ui";
import { primaryActionClass } from "@/components/finance/SandboxUi";

// Post box for the team feedback board. Clears itself after a successful post;
// the new entry then appears in the list (and on everyone else's open tab via
// AutoRefresh within a few seconds).
export default function FeedbackForm() {
  const [state, action, pending] = useActionState(postFeedback, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-3 px-5 py-4">
      <div>
        <label htmlFor="feedback-body" className={labelClass}>Your feedback</label>
        <textarea
          id="feedback-body"
          name="body"
          rows={3}
          maxLength={2000}
          required
          placeholder="What's working, what isn't, what would make your day easier…"
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-44">
          <label htmlFor="feedback-category" className={labelClass}>Type</label>
          <select id="feedback-category" name="category" defaultValue="GENERAL" className={inputClass}>
            <option value="GENERAL">General</option>
            <option value="IDEA">Idea</option>
            <option value="ISSUE">Issue</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          {state?.error && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{state.error}</p>}
          <button type="submit" disabled={pending} className={`${primaryActionClass} disabled:opacity-50`}>
            {pending ? "Posting…" : "Post feedback"}
          </button>
        </div>
      </div>
    </form>
  );
}
