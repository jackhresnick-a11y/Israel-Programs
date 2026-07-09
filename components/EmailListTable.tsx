"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { ProgramContactEmail } from "@/lib/programs";

// Keeps each generated Gmail compose URL comfortably under browser/URL-length
// limits so very large selections still work, split across multiple buttons.
const MAX_URL_LENGTH = 1800;
const GMAIL_COMPOSE_BASE = "https://mail.google.com/mail/?view=cm&fs=1&bcc=";

function chunkEmails(emails: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLength = GMAIL_COMPOSE_BASE.length;

  for (const email of emails) {
    const added = encodeURIComponent(`,${email}`).length;
    if (current.length > 0 && currentLength + added > MAX_URL_LENGTH) {
      chunks.push(current);
      current = [];
      currentLength = GMAIL_COMPOSE_BASE.length;
    }
    current.push(email);
    currentLength += added;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export default function EmailListTable({ programs }: { programs: ProgramContactEmail[] }) {
  const { toast } = useToast();
  const withEmail = useMemo(() => programs.filter((p) => p.contactEmail), [programs]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(withEmail.map((p) => p.id))
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedEmails = withEmail
    .filter((p) => selected.has(p.id))
    .map((p) => p.contactEmail!);

  const chunks = useMemo(() => chunkEmails(selectedEmails), [selectedEmails]);

  function openDraft(chunk: string[]) {
    const url = `${GMAIL_COMPOSE_BASE}${encodeURIComponent(chunk.join(","))}`;
    window.open(url, "_blank", "noopener");
  }

  async function copyEmails() {
    await navigator.clipboard.writeText(selectedEmails.join(", "));
    toast("Emails copied to clipboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSelected(new Set(withEmail.map((p) => p.id)))}
          >
            Select all
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
            Select none
          </Button>
          <span className="text-sm text-muted">
            {selectedEmails.length} of {withEmail.length} selected
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={selectedEmails.length === 0} onClick={copyEmails}>
            Copy emails to clipboard
          </Button>
          {chunks.map((chunk, i) => (
            <Button key={i} type="button" size="sm" onClick={() => openDraft(chunk)}>
              {chunks.length > 1 ? `Open Gmail draft ${i + 1} of ${chunks.length}` : "Open Gmail draft"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {programs.map((program) => {
          const hasEmail = Boolean(program.contactEmail);
          return (
            <label
              key={program.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${hasEmail ? "" : "opacity-50"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(program.id)}
                disabled={!hasEmail}
                onChange={() => toggle(program.id)}
                className="h-4 w-4 accent-accent"
              />
              <span className="flex-1 text-sm text-foreground">{program.name}</span>
              <span className="text-xs text-muted">
                {program.contactEmail ?? "No email on file"}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
