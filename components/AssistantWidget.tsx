"use client";

import { useState } from "react";
import Link from "next/link";
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
};

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi! Tell me what you're looking for -- e.g. \"something religious, 3 months, focused on volunteering\" -- and I'll suggest programs from the directory.",
};

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
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition hover:bg-accent-hover"
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
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end" : "self-start"}>
              <div
                className={
                  m.role === "user"
                    ? "rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground"
                    : "rounded-xl bg-surface-muted px-3 py-2 text-sm text-foreground"
                }
              >
                {m.content}
              </div>
              {m.programs && m.programs.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  {m.programs.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/programs/${p.slug}`}
                      className="rounded-lg border border-border p-2.5 text-xs transition hover:border-accent"
                    >
                      <p className="font-semibold text-foreground">{p.name}</p>
                      {p.location && <p className="text-muted">{p.location}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} tone="tag">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && <div className="self-start rounded-xl bg-surface-muted px-3 py-2 text-sm text-muted">Thinking...</div>}
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
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
        />
        <Button type="submit" size="sm" disabled={sending || !input.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}
