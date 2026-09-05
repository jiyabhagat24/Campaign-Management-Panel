"use client";

import { useRef, useState } from "react";
import { addRemark } from "@/lib/actions";

export type ThreadRemark = {
  id: string;
  body: string;
  authorRoleSnapshot: string;
  createdAt: Date;
  author: { name: string };
};

type Mentionable = { id: string; name: string };

// Renders "@Word" tokens inside a remark body in indigo/bold, WhatsApp-style
// — purely visual, doesn't need to resolve back to a real user.
function renderBody(body: string) {
  const parts = body.split(/(@[A-Za-z0-9_]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-semibold text-indigo-600 dark:text-indigo-400">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function CommunicationsThread({
  campaignId,
  remarks,
  mentionable,
}: {
  campaignId: string;
  remarks: ThreadRemark[];
  mentionable: Mentionable[];
}) {
  const [body, setBody] = useState("");
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions =
    query === null
      ? []
      : mentionable.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    const cursor = e.target.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
    setQuery(match ? match[1] : null);
  }

  function selectMention(person: Mentionable) {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? body.length;
    const upto = body.slice(0, cursor);
    const rest = body.slice(cursor);
    const tag = `@${person.name.replace(/\s+/g, "")}`;
    const newUpto = upto.replace(/@([A-Za-z0-9_]*)$/, `${tag} `);
    setBody(newUpto + rest);
    setMentionedIds((prev) => new Set(prev).add(person.id));
    setQuery(null);
    requestAnimationFrame(() => textarea?.focus());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    await addRemark(campaignId, trimmed, { mentionUserIds: Array.from(mentionedIds) });
    setBody("");
    setMentionedIds(new Set());
    setQuery(null);
  }

  return (
    <div className="max-w-2xl">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {remarks.map((r) => (
          <div key={r.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink dark:text-white">
                {r.author.name} <span className="font-normal text-slate-400 dark:text-slate-500">· {r.authorRoleSnapshot.replace(/_/g, " ").toLowerCase()}</span>
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
            </div>
            <p className="mt-1 text-slate-700 dark:text-slate-300">{renderBody(r.body)}</p>
          </div>
        ))}
        {remarks.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No remarks yet — all feedback happens here, not on WhatsApp.</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <div className="relative flex-1">
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {suggestions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMention(m)}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            rows={2}
            placeholder="Write a remark... type @ to tag someone"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>
        <button type="submit" className="self-end rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Send
        </button>
      </form>
    </div>
  );
}
