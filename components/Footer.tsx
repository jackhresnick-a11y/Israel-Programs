"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ObfuscatedEmail from "@/components/ObfuscatedEmail";

export default function Footer() {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const hidden =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up");
  if (hidden) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, path: pathname, website }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit");
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
      setStatus("error");
    }
  }

  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 pb-16">
        {status === "success" ? (
          <p className="text-sm text-foreground">Thanks — we&apos;ll be in touch.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              Not sure which program fits? Ask us.
            </p>
            {error && (
              <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <Input
                required
                type="email"
                placeholder="Your email"
                value={email}
                maxLength={320}
                onChange={(e) => setEmail(e.target.value)}
                className="sm:w-56"
              />
              <Input
                placeholder="What are you looking for? (optional)"
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                className="sm:flex-1"
              />
              {/* Honeypot — hidden from real users, off-screen rather than
                  display:none so it still trips up bots that skip hidden fields. */}
              <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="footer-website">Website</label>
                <input
                  id="footer-website"
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending..." : "Ask us"}
              </Button>
            </form>
            {status === "error" && <ObfuscatedEmail />}
          </>
        )}
      </div>
    </footer>
  );
}
