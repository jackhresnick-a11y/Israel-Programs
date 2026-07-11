"use client";

import { useState } from "react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import ObfuscatedEmail from "@/components/ObfuscatedEmail";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send message");
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm text-foreground">
        Thanks — your message has been sent. We&apos;ll get back to you soon.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <Input
          required
          placeholder="Your name"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          required
          type="email"
          placeholder="Your email"
          value={email}
          maxLength={320}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Textarea
          required
          rows={4}
          placeholder="How can we help?"
          value={message}
          maxLength={5000}
          onChange={(e) => setMessage(e.target.value)}
        />
        {/* Honeypot — hidden from real users, off-screen rather than
            display:none so it still trips up bots that skip hidden fields. */}
        <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={status === "submitting"} className="w-fit">
          {status === "submitting" ? "Sending..." : "Send message"}
        </Button>
      </form>
      {status === "error" ? <ObfuscatedEmail prominent /> : <ObfuscatedEmail />}
    </div>
  );
}
