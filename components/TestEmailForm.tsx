"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

type Template = "contact" | "verification" | "outreach";

const TEMPLATE_OPTIONS: { value: Template; label: string }[] = [
  { value: "contact", label: "Contact form notification" },
  { value: "verification", label: "Verification request (preview only)" },
  { value: "outreach", label: "Outreach: verify your listing" },
];

type Result =
  | { ok: true; resendId: string; from?: string; to: string }
  | { ok: false; error: string; from?: string; to: string };

export default function TestEmailForm() {
  const [to, setTo] = useState("");
  const [template, setTemplate] = useState<Template>("contact");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, template }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Request failed", to });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border p-5">
      <div>
        <h2 className="font-serif text-lg font-semibold text-foreground">Send test email</h2>
        <p className="mt-1 text-sm text-muted">
          Send a sample of any template to any destination address. Useful for previewing
          copy/formatting and confirming inbox routing.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="test-email-to" className="text-sm font-medium text-foreground">
            Destination email
          </label>
          <input
            id="test-email-to"
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="test-email-template" className="text-sm font-medium text-foreground">
            Template
          </label>
          <select
            id="test-email-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value as Template)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            {TEMPLATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={sending || !to}
          className={buttonVariants({ variant: "primary", size: "sm", className: "self-start" })}
        >
          {sending ? "Sending..." : "Send test email"}
        </button>
      </form>

      {result && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border p-4 text-sm">
          {result.ok ? (
            <>
              <Badge tone="success">Sent</Badge>
              <span className="text-muted">
                To <span className="text-foreground">{result.to}</span>
                {result.from && (
                  <>
                    {" "}
                    from <span className="text-foreground">{result.from}</span>
                  </>
                )}
              </span>
              <span className="text-muted">
                Resend message id: <span className="font-mono text-foreground">{result.resendId}</span>
              </span>
            </>
          ) : (
            <>
              <Badge tone="danger">Failed</Badge>
              <span className="text-muted">{result.error}</span>
              {result.from && <span className="text-muted">Resolved from: {result.from}</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
