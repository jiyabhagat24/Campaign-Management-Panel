"use client";

import { useFormStatus } from "react-dom";

// The New Campaign form posts straight to a server action with no client
// JS of its own, so without this the submit button gave zero feedback on
// click — nothing visibly happened until the full round trip (create +
// notify every IR Manager + redirect) finished, which read as "not
// working" and left a plain click free to double-submit. useFormStatus
// reads pending state from the nearest parent <form>, no prop wiring needed.
export default function CreateCampaignButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create campaign"}
    </button>
  );
}
