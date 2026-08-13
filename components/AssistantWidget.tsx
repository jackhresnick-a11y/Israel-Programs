"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

type Message = {
  role: "user" | "assistant";
  content: string;
  programs?: RecommendedProgram[];
};

type RecommendedProgram = {
  slug: string;
  name: string;
  location: string | null;
  durationType: string;
  tags: string[];
  descriptionExcerpt: string;
  why: string;
  role: "pick" | "alternative";
  unmetLabels: string[];
};

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi! Tell me what you’re looking for — e.g. “something religious, 3 months, focused on volunteering” — and I’ll suggest programs from the directory.",
};

/** One recommended program's card -- `why` (the model's per-candidate explanation) and
 * `unmetLabels` (which parsed constraints this program doesn't meet, stated plainly
 * rather than glossed over) are both structured fields from the API response, not
 * parsed out of prose. */
function ProgramResultCard({ program: p }: { program: RecommendedProgram }) {
  return (
    <Link
      href={`/programs/${p.slug}`}
      className="rounded border border-border p-3 text-xs transition-colors duration-[120ms] ease-out hover:border-accent-hover"
    >
      <p className="font-semibold text-foreground">{p.name}</p>
      {p.location && <p className="text-muted">{p.location}</p>}
      {p.why && <p className="mt-1 text-foreground">{p.why}</p>}
      {p.unmetLabels.length > 0 && (
        <p className="mt-1 text-muted">Doesn’t match: {p.unmetLabels.join(", ")}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {p.tags.slice(0, 4).map((tag) => (
          <Badge key={tag} tone="tag">
            {tag}
          </Badge>
        ))}
      </div>
    </Link>
  );
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((cur) => [...cur, { role: "user", content: message }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply, programs: data.programs }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors duration-[120ms] ease-out hover:bg-accent-hover"
        aria-label="Open program-finder assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.17 0-2.29-.2-3.31-.57L3 21l1.67-4.17C3.61 15.5 3 13.82 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    );
  }

  return (
    <Card className="fixed bottom-5 right-5 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Find a program</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-foreground"
          aria-label="Close assistant"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end" : "self-start"}>
              <div
                className={
                  m.role === "user"
                    ? "rounded bg-accent px-3 py-2 text-sm text-accent-foreground"
                    : "rounded bg-surface-muted px-3 py-2 text-sm text-foreground"
                }
              >
                {m.content}
              </div>
              {m.programs && m.programs.length > 0 && (() => {
                const picks = m.programs.filter((p) => p.role === "pick");
                const alternatives = m.programs.filter((p) => p.role === "alternative");
                return (
                  <div className="mt-2 flex flex-col gap-2">
                    {picks.map((p) => (
                      <ProgramResultCard key={p.slug} program={p} />
                    ))}
                    {alternatives.length > 0 && (
                      <>
                        <p className="mt-1 text-xs font-medium text-muted">Also worth a look</p>
                        {alternatives.map((p) => (
                          <ProgramResultCard key={p.slug} program={p} />
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
          {sending && <div className="self-start rounded bg-surface-muted px-3 py-2 text-sm text-muted">Thinking...</div>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-border p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What are you looking for?"
          disabled={sending}
          className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors duration-[120ms] ease-out focus:border-accent-hover"
        />
        <Button type="submit" size="sm" disabled={sending || !input.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}
