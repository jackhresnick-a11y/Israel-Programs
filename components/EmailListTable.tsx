"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { ProgramContactEmail } from "@/lib/programs";

// Keeps each generated Gmail compose URL comfortably under browser/URL-length
// limits so very large selections still work, split across multiple buttons.
const MAX_URL_LENGTH = 1800;
const GMAIL_COMPOSE_BASE = "https://mail.google.com/mail/?view=cm&fs=1&bcc=";

type WebsiteLanguage = "ENGLISH" | "HEBREW" | "BOTH";
type Row = ProgramContactEmail & { needsVerification: boolean };
type VerifiedFilter = "ALL" | WebsiteLanguage | "UNCLASSIFIED";

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

const LANGUAGE_LABELS: Record<WebsiteLanguage, string> = {
  ENGLISH: "English",
  HEBREW: "Hebrew",
  BOTH: "English + Hebrew",
};

/** One independently selectable/BCC-able list of programs. Owns its own selection
 * state -- sections never share a selection, so picking "select all" in one section
 * has no effect on another. */
function EmailSection({
  title,
  description,
  programs,
  onLanguageChange,
}: {
  title: string;
  description?: string;
  programs: Row[];
  onLanguageChange: (id: string, language: WebsiteLanguage | null) => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(programs.map((p) => p.id)));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedEmails = programs.filter((p) => selected.has(p.id)).map((p) => p.contactEmail!);
  const chunks = useMemo(() => chunkEmails(selectedEmails), [selectedEmails]);

  function openDraft(chunk: string[]) {
    const url = `${GMAIL_COMPOSE_BASE}${encodeURIComponent(chunk.join(","))}`;
    window.open(url, "_blank", "noopener");
  }

  async function copyEmails() {
    await navigator.clipboard.writeText(selectedEmails.join(", "));
    toast("Emails copied to clipboard");
  }

  if (programs.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted">None.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {title} <span className="font-normal text-muted">({programs.length})</span>
        </h2>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set(programs.map((p) => p.id)))}>
            Select all
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
            Select none
          </Button>
          <span className="text-sm text-muted">
            {selectedEmails.length} of {programs.length} selected
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
        {programs.map((program) => (
          <label key={program.id} className="flex items-center gap-3 px-4 py-2.5">
            <input
              type="checkbox"
              checked={selected.has(program.id)}
              onChange={() => toggle(program.id)}
              className="h-4 w-4 accent-accent"
            />
            <span className="flex-1 text-sm text-foreground">{program.name}</span>
            {program.needsVerification ? (
              <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning">
                Not verified
              </span>
            ) : null}
            <span className="text-xs text-muted">{program.contactEmail}</span>
            <select
              value={program.websiteLanguage ?? ""}
              onChange={(e) => {
                e.stopPropagation();
                onLanguageChange(program.id, (e.target.value || null) as WebsiteLanguage | null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
            >
              <option value="">Unclassified</option>
              <option value="ENGLISH">English</option>
              <option value="HEBREW">Hebrew</option>
              <option value="BOTH">Both</option>
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

export default function EmailListTable({ programs: initialPrograms }: { programs: Row[] }) {
  const { toast } = useToast();
  const [programs, setPrograms] = useState(initialPrograms);
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("ALL");

  const withEmail = useMemo(() => programs.filter((p) => p.contactEmail), [programs]);

  async function handleLanguageChange(id: string, language: WebsiteLanguage | null) {
    const prior = programs;
    setPrograms((cur) => cur.map((p) => (p.id === id ? { ...p, websiteLanguage: language } : p)));
    try {
      const res = await fetch(`/api/admin/programs/${id}/website-language`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) throw new Error("Request failed");
      toast("Website language updated");
    } catch {
      setPrograms(prior);
      toast("Failed to update website language");
    }
  }

  const englishOnly = withEmail.filter((p) => p.websiteLanguage === "ENGLISH");
  const hebrewOnly = withEmail.filter((p) => p.websiteLanguage === "HEBREW");
  const both = withEmail.filter((p) => p.websiteLanguage === "BOTH");
  const unclassified = withEmail.filter((p) => !p.websiteLanguage);

  const notYetVerified = withEmail.filter((p) => p.needsVerification);
  const notYetVerifiedFiltered = notYetVerified.filter((p) => {
    if (verifiedFilter === "ALL") return true;
    if (verifiedFilter === "UNCLASSIFIED") return !p.websiteLanguage;
    return p.websiteLanguage === verifiedFilter;
  });

  const filterChips: { key: VerifiedFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "ENGLISH", label: "English" },
    { key: "HEBREW", label: "Hebrew" },
    { key: "BOTH", label: "Both" },
    { key: "UNCLASSIFIED", label: "Unclassified" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <EmailSection title="English websites" programs={englishOnly} onLanguageChange={handleLanguageChange} />
      <EmailSection title="Hebrew websites" programs={hebrewOnly} onLanguageChange={handleLanguageChange} />
      <EmailSection
        title="English + Hebrew (both)"
        programs={both}
        onLanguageChange={handleLanguageChange}
      />
      <EmailSection
        title="Unclassified"
        description="Website language hasn't been detected or set yet."
        programs={unclassified}
        onLanguageChange={handleLanguageChange}
      />

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <div>
          <p className="text-xs text-muted">
            Not yet verified: emails with no human verification on file, or a verification older than
            the staleness window (see the Email verification queue). Filter by website language, then BCC.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setVerifiedFilter(chip.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                verifiedFilter === chip.key
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-muted hover:bg-surface-muted"
              }`}
            >
              {LANGUAGE_LABELS[chip.key as WebsiteLanguage] ?? chip.label}
            </button>
          ))}
        </div>
        <EmailSection
          title={
            verifiedFilter === "ALL"
              ? "Not yet verified"
              : `Not yet verified — ${LANGUAGE_LABELS[verifiedFilter as WebsiteLanguage] ?? "Unclassified"}`
          }
          programs={notYetVerifiedFiltered}
          onLanguageChange={handleLanguageChange}
        />
      </section>
    </div>
  );
}
