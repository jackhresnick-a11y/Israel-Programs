"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

type OutreachStatus = "DRAFT" | "APPROVED" | "SENT" | "BOUNCED" | "REPLIED" | "WRONG_CONTACT";

type OutreachEmail = {
  id: string;
  status: OutreachStatus;
  toEmail: string;
  toEmailOverridden: boolean;
  subject: string;
  body: string;
  edited: boolean;
  note: string | null;
  sentAt: Date | null;
};

type WebsiteLanguage = "ENGLISH" | "HEBREW" | "BOTH";
type LanguageFilter = "ALL" | WebsiteLanguage | "UNCLASSIFIED";

type EligibleProgram = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  durationType: string;
  contactEmail: string | null;
  contactEmailSource: string | null;
  websiteLanguage: WebsiteLanguage | null;
  outreachEmail: OutreachEmail | null;
};

type NeedsSourceCheckProgram = { id: string; slug: string; name: string; contactEmail: string | null };

type Templates = {
  outreachSubjectTemplate: string;
  outreachBodyTemplate: string;
  outreachBatchSize: string;
};

const STATUS_TONE: Record<OutreachStatus, BadgeTone> = {
  DRAFT: "neutral",
  APPROVED: "info",
  SENT: "success",
  BOUNCED: "danger",
  REPLIED: "success",
  WRONG_CONTACT: "warning",
};

const LANGUAGE_LABELS: Record<WebsiteLanguage, string> = {
  ENGLISH: "English",
  HEBREW: "Hebrew",
  BOTH: "English + Hebrew",
};

const LANGUAGE_FILTER_CHIPS: { key: LanguageFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ENGLISH", label: "English" },
  { key: "HEBREW", label: "Hebrew" },
  { key: "BOTH", label: "Both" },
  { key: "UNCLASSIFIED", label: "Unclassified" },
];

function matchesLanguageFilter(program: EligibleProgram, filter: LanguageFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "UNCLASSIFIED") return !program.websiteLanguage;
  return program.websiteLanguage === filter;
}

/** Shared filter-chip row used above both the Drafts and Approved lists -- counts are
 * computed from the full (unfiltered) set passed in, so they never shift as the admin
 * clicks between chips. */
function LanguageFilterChips({
  programs,
  active,
  onChange,
}: {
  programs: EligibleProgram[];
  active: LanguageFilter;
  onChange: (filter: LanguageFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGE_FILTER_CHIPS.map((chip) => {
        const count = programs.filter((p) => matchesLanguageFilter(p, chip.key)).length;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              active === chip.key
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted hover:bg-surface-muted"
            }`}
          >
            {chip.label} ({count})
          </button>
        );
      })}
    </div>
  );
}

function LanguageBadge({ language }: { language: WebsiteLanguage | null }) {
  if (!language) return null;
  return <Badge tone="tag">{LANGUAGE_LABELS[language]}</Badge>;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function OutreachManager({
  eligible,
  needsSourceCheck,
  templates: initialTemplates,
}: {
  eligible: EligibleProgram[];
  needsSourceCheck: NeedsSourceCheckProgram[];
  templates: Templates;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [programs, setPrograms] = useState(eligible);
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editToEmail, setEditToEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // a coarse "something is loading" key
  const [draftLanguageFilter, setDraftLanguageFilter] = useState<LanguageFilter>("ALL");
  const [approvedLanguageFilter, setApprovedLanguageFilter] = useState<LanguageFilter>("ALL");

  const noDraft = programs.filter((p) => !p.outreachEmail);
  const drafts = programs.filter((p) => p.outreachEmail?.status === "DRAFT");
  const approved = programs.filter((p) => p.outreachEmail?.status === "APPROVED");
  const actioned = programs.filter(
    (p) => p.outreachEmail && ["SENT", "BOUNCED", "REPLIED", "WRONG_CONTACT"].includes(p.outreachEmail.status)
  );
  const draftSelectionEmails = useMemo(
    () => drafts.filter((p) => p.outreachEmail && selectedDraftIds.has(p.outreachEmail.id)),
    [drafts, selectedDraftIds]
  );
  const draftsFiltered = useMemo(
    () => drafts.filter((p) => matchesLanguageFilter(p, draftLanguageFilter)),
    [drafts, draftLanguageFilter]
  );
  const approvedFiltered = useMemo(
    () => approved.filter((p) => matchesLanguageFilter(p, approvedLanguageFilter)),
    [approved, approvedLanguageFilter]
  );

  function updateOutreach(programId: string, patch: Partial<OutreachEmail>) {
    setPrograms((cur) =>
      cur.map((p) => (p.id === programId && p.outreachEmail ? { ...p, outreachEmail: { ...p.outreachEmail, ...patch } } : p))
    );
  }

  /** Clears outreachEmail back to null after a successful delete -- the Program row
   * itself stays in `programs` (it reappears under "no draft yet" via the noDraft
   * filter), matching what generateDrafts() would see on the real DB afterward. */
  function clearOutreach(programId: string) {
    setPrograms((cur) => cur.map((p) => (p.id === programId ? { ...p, outreachEmail: null } : p)));
  }

  async function handleSaveTemplates() {
    setBusy("templates");
    try {
      await postJson("/api/admin/outreach/templates", templates);
      toast("Templates saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save templates");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateDrafts() {
    setBusy("generate");
    try {
      const result = await postJson("/api/admin/outreach/generate-drafts");
      toast(`Generated ${result.created} draft(s) (${result.skippedExisting} already had one)`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate drafts");
    } finally {
      setBusy(null);
    }
  }

  function startEdit(program: EligibleProgram) {
    if (!program.outreachEmail) return;
    setEditingId(program.outreachEmail.id);
    setEditSubject(program.outreachEmail.subject);
    setEditBody(program.outreachEmail.body);
    setEditToEmail(program.outreachEmail.toEmail);
  }

  async function saveEdit(program: EligibleProgram) {
    if (!program.outreachEmail) return;
    const oe = program.outreachEmail;
    setBusy(oe.id);
    try {
      const toEmailChanged = editToEmail.trim() !== oe.toEmail;
      const res = await fetch(`/api/admin/outreach/${oe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          body: editBody,
          ...(toEmailChanged ? { toEmail: editToEmail.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      updateOutreach(program.id, {
        subject: editSubject,
        body: editBody,
        edited: true,
        ...(toEmailChanged ? { toEmail: editToEmail.trim(), toEmailOverridden: true } : {}),
      });
      setEditingId(null);
      toast(toEmailChanged ? "Draft updated — recipient redirected" : "Draft updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setBusy(null);
    }
  }

  async function deleteOne(program: EligibleProgram) {
    if (!program.outreachEmail) return;
    if (!confirm(`Delete this draft for ${program.name}? This only removes the draft, not the program.`)) return;
    const oe = program.outreachEmail;
    setBusy(oe.id);
    try {
      const res = await fetch(`/api/admin/outreach/${oe.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      clearOutreach(program.id);
      setSelectedDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(oe.id);
        return next;
      });
      toast("Draft deleted");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete draft");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    const ids = draftSelectionEmails.map((p) => p.outreachEmail!.id);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected draft(s)? This only removes the drafts, not the programs.`)) return;
    setBusy("delete");
    try {
      const result = await postJson("/api/admin/outreach/delete", { ids });
      const deletedIds = new Set(
        draftSelectionEmails.filter((p) => p.outreachEmail && ids.includes(p.outreachEmail.id)).map((p) => p.id)
      );
      // We don't know exactly which ones the server actually deleted vs. skipped as
      // protected without another round trip, but every id we sent here came from the
      // Drafts section, and deleteDrafts() allows DRAFT/APPROVED -- so for this
      // selection (always DRAFT), result.deleted === ids.length whenever nothing raced
      // status change concurrently. Clear locally what we asked to delete either way
      // and let the toast report the authoritative server count.
      setPrograms((cur) => cur.map((p) => (deletedIds.has(p.id) ? { ...p, outreachEmail: null } : p)));
      setSelectedDraftIds(new Set());
      toast(`Deleted ${result.deleted} of ${result.requested} draft(s)`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete drafts");
    } finally {
      setBusy(null);
    }
  }

  function toggleSelected(outreachId: string) {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(outreachId)) next.delete(outreachId);
      else next.add(outreachId);
      return next;
    });
  }

  /** Selects exactly the currently-filtered (shown) draft rows -- combined with a
   * language chip, this is the "approve/delete only English websites" flow: pick a
   * chip, select all shown, then Approve selected (targeting who gets emailed) or
   * Delete selected. */
  function selectAllShown() {
    setSelectedDraftIds(new Set(draftsFiltered.map((p) => p.outreachEmail!.id)));
  }

  function selectNone() {
    setSelectedDraftIds(new Set());
  }

  async function deleteAllDrafts() {
    const ids = drafts.map((p) => p.outreachEmail!.id);
    if (ids.length === 0) return;
    if (!confirm(`Delete ALL ${ids.length} draft(s)? This ignores the current filter and removes every draft, not just what's shown. Programs and their real contact data are never touched.`)) {
      return;
    }
    setBusy("delete-all");
    try {
      const result = await postJson("/api/admin/outreach/delete", { ids });
      const deletedIds = new Set(drafts.map((p) => p.id));
      setPrograms((cur) => cur.map((p) => (deletedIds.has(p.id) ? { ...p, outreachEmail: null } : p)));
      setSelectedDraftIds(new Set());
      toast(`Deleted ${result.deleted} of ${result.requested} draft(s)`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete all drafts");
    } finally {
      setBusy(null);
    }
  }

  async function approveIds(ids: string[]) {
    if (ids.length === 0) return;
    setBusy("approve");
    try {
      await postJson("/api/admin/outreach/approve", { ids });
      setPrograms((cur) =>
        cur.map((p) =>
          p.outreachEmail && ids.includes(p.outreachEmail.id)
            ? { ...p, outreachEmail: { ...p.outreachEmail, status: "APPROVED" as OutreachStatus } }
            : p
        )
      );
      setSelectedDraftIds(new Set());
      toast(`Approved ${ids.length} draft(s)`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusy(null);
    }
  }

  async function handleSendBatch() {
    if (!confirm(`Send up to ${templates.outreachBatchSize} approved emails now?`)) return;
    setBusy("send");
    try {
      const result = await postJson("/api/admin/outreach/send-batch");
      toast(
        `Sent ${result.sent}, failed ${result.failed}, reverted ${result.skippedChanged + result.skippedUnpublished} (attempted ${result.attempted})`
      );
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send batch");
    } finally {
      setBusy(null);
    }
  }

  const OUTCOME_PROMPTS: Partial<Record<"REPLIED" | "WRONG_CONTACT" | "VERIFIED", string>> = {
    WRONG_CONTACT: "Who did it actually reach? (optional):",
    REPLIED: "Reply summary (optional):",
  };

  async function handleOutcome(program: EligibleProgram, outcome: "REPLIED" | "WRONG_CONTACT" | "VERIFIED") {
    if (!program.outreachEmail) return;
    const prompt = OUTCOME_PROMPTS[outcome];
    const note = prompt ? window.prompt(prompt) ?? undefined : undefined;
    setBusy(program.outreachEmail.id);
    try {
      await postJson(`/api/admin/outreach/${program.outreachEmail.id}/outcome`, { outcome, note });
      if (outcome !== "VERIFIED") {
        updateOutreach(program.id, { status: outcome, note: note ?? null });
      }
      toast(outcome === "VERIFIED" ? "Marked verified (see the email-verification queue)" : `Marked ${outcome.toLowerCase()}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to record outcome");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Templates */}
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Email template</h2>
        <p className="text-xs text-muted">
          Merge fields: <code>{"{contactName|\"there\"}"}</code>, <code>{"{programName}"}</code>,{" "}
          <code>{"{listingUrl}"}</code>, <code>{"{programDescriptor}"}</code> (built only from duration + location --
          e.g. &ldquo;your gap year program in Jerusalem&rdquo;). Editing here only affects future &ldquo;Generate
          drafts&rdquo; runs, not existing drafts.
        </p>
        <label className="text-xs font-medium text-muted">Subject</label>
        <Input
          value={templates.outreachSubjectTemplate}
          onChange={(e) => setTemplates((t) => ({ ...t, outreachSubjectTemplate: e.target.value }))}
        />
        <label className="text-xs font-medium text-muted">Body</label>
        <Textarea
          rows={8}
          value={templates.outreachBodyTemplate}
          onChange={(e) => setTemplates((t) => ({ ...t, outreachBodyTemplate: e.target.value }))}
        />
        <label className="text-xs font-medium text-muted">Batch size (max emails per &ldquo;Send next batch&rdquo; click)</label>
        <Input
          type="number"
          min={1}
          className="w-32"
          value={templates.outreachBatchSize}
          onChange={(e) => setTemplates((t) => ({ ...t, outreachBatchSize: e.target.value }))}
        />
        <div>
          <Button size="sm" onClick={handleSaveTemplates} disabled={busy === "templates"}>
            {busy === "templates" ? "Saving..." : "Save template"}
          </Button>
        </div>
      </section>

      {/* Generate */}
      <section className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
        <p className="text-sm text-foreground">
          {noDraft.length} eligible program(s) have no draft yet. {drafts.length} draft(s), {approved.length} approved,{" "}
          {actioned.length} sent/actioned.
        </p>
        <Button onClick={handleGenerateDrafts} disabled={busy === "generate" || noDraft.length === 0}>
          {busy === "generate" ? "Generating..." : `Generate ${noDraft.length} draft(s)`}
        </Button>
      </section>

      {/* Drafts */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Drafts ({drafts.length})</h2>
          <Button
            size="sm"
            variant="destructive"
            disabled={drafts.length === 0 || busy === "delete-all"}
            onClick={deleteAllDrafts}
          >
            {busy === "delete-all" ? "Deleting..." : `Delete all drafts (${drafts.length})`}
          </Button>
        </div>
        <LanguageFilterChips programs={drafts} active={draftLanguageFilter} onChange={setDraftLanguageFilter} />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={selectAllShown} disabled={draftsFiltered.length === 0}>
              Select all shown ({draftsFiltered.length})
            </Button>
            <Button size="sm" variant="secondary" onClick={selectNone} disabled={selectedDraftIds.size === 0}>
              Select none
            </Button>
            <span className="text-sm text-muted">{selectedDraftIds.size} selected</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedDraftIds.size === 0 || busy === "delete"}
              onClick={deleteSelected}
            >
              Delete selected ({selectedDraftIds.size})
            </Button>
            <Button
              size="sm"
              disabled={selectedDraftIds.size === 0 || busy === "approve"}
              onClick={() => approveIds(draftSelectionEmails.map((p) => p.outreachEmail!.id))}
            >
              Approve selected ({selectedDraftIds.size})
            </Button>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {draftsFiltered.length === 0 && <p className="p-4 text-sm text-muted">No drafts{draftLanguageFilter !== "ALL" ? " match this filter" : ""}.</p>}
          {draftsFiltered.map((program) => {
            const oe = program.outreachEmail!;
            const isEditing = editingId === oe.id;
            return (
              <div key={program.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedDraftIds.has(oe.id)}
                    onChange={() => toggleSelected(oe.id)}
                    className="h-4 w-4 accent-accent"
                  />
                  <Link href={`/programs/${program.slug}/edit`} className="font-medium text-foreground hover:underline">
                    {program.name}
                  </Link>
                  <LanguageBadge language={program.websiteLanguage} />
                  {oe.edited && <Badge tone="info">Hand-edited</Badge>}
                  {oe.toEmailOverridden && <Badge tone="warning">Redirected</Badge>}
                  <span className="text-xs text-muted">{oe.toEmail}</span>
                </div>
                {isEditing ? (
                  <div className="flex flex-col gap-2 pl-7">
                    <label className="text-xs font-medium text-muted">To</label>
                    <Input type="email" value={editToEmail} onChange={(e) => setEditToEmail(e.target.value)} />
                    {editToEmail.trim() !== oe.toEmail && (
                      <p className="text-xs text-warning">
                        This will redirect the draft away from the program&rsquo;s contact email ({program.contactEmail}).
                      </p>
                    )}
                    <label className="text-xs font-medium text-muted">Subject</label>
                    <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                    <label className="text-xs font-medium text-muted">Body</label>
                    <Textarea rows={6} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(program)} disabled={busy === oe.id}>
                        {busy === oe.id ? "Saving..." : "Save"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 pl-7">
                    <p className="text-sm font-medium text-foreground">{oe.subject}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted">{oe.body}</p>
                    <div className="mt-1 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(program)}>
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => approveIds([oe.id])} disabled={busy === "approve"}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteOne(program)} disabled={busy === oe.id}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Approved / send */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Approved, ready to send ({approved.length})</h2>
          <Button onClick={handleSendBatch} disabled={busy === "send" || approved.length === 0} variant="primary">
            {busy === "send" ? "Sending..." : `Send next batch (up to ${templates.outreachBatchSize})`}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Send next batch sends every approved row regardless of language -- to send only one language, approve just
          that filtered selection above before clicking send.
        </p>
        <LanguageFilterChips programs={approved} active={approvedLanguageFilter} onChange={setApprovedLanguageFilter} />
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {approvedFiltered.length === 0 && (
            <p className="p-4 text-sm text-muted">
              {approved.length === 0 ? "Nothing approved yet." : "No approved drafts match this filter."}
            </p>
          )}
          {approvedFiltered.map((program) => {
            const oe = program.outreachEmail!;
            return (
              <div key={program.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Link href={`/programs/${program.slug}/edit`} className="font-medium text-foreground hover:underline">
                    {program.name}
                  </Link>
                  <LanguageBadge language={program.websiteLanguage} />
                  {oe.toEmailOverridden && <Badge tone="warning">Redirected</Badge>}
                  <span className="text-xs text-muted">{oe.toEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE.APPROVED}>Approved</Badge>
                  <Button size="sm" variant="destructive" onClick={() => deleteOne(program)} disabled={busy === oe.id}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sent / outcomes */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Sent &amp; outcomes ({actioned.length})</h2>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {actioned.length === 0 && <p className="p-4 text-sm text-muted">Nothing sent yet.</p>}
          {actioned.map((program) => {
            const oe = program.outreachEmail!;
            return (
              <div key={program.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/programs/${program.slug}/edit`} className="font-medium text-foreground hover:underline">
                      {program.name}
                    </Link>
                    <Badge tone={STATUS_TONE[oe.status]}>{oe.status}</Badge>
                  </div>
                  <span className="text-xs text-muted">
                    {oe.toEmail} {oe.sentAt ? `· sent ${new Date(oe.sentAt).toLocaleDateString()}` : ""}
                  </span>
                  {oe.note && <span className="text-xs text-muted">{oe.note}</span>}
                </div>
                {oe.status === "SENT" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleOutcome(program, "VERIFIED")} disabled={busy === oe.id}>
                      Verified
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleOutcome(program, "REPLIED")} disabled={busy === oe.id}>
                      Replied
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleOutcome(program, "WRONG_CONTACT")} disabled={busy === oe.id}>
                      Wrong contact
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Needs source check */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Needs source check ({needsSourceCheck.length})</h2>
        <p className="text-xs text-muted">
          Has a contact email but no recorded provenance (no source URL) -- excluded from drafting and sending until a
          source is confirmed via the program edit page.
        </p>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {needsSourceCheck.length === 0 && <p className="p-4 text-sm text-muted">None -- every contact email has a recorded source.</p>}
          {needsSourceCheck.map((program) => (
            <div key={program.id} className="flex items-center justify-between gap-3 p-4">
              <Link href={`/programs/${program.slug}/edit`} className="font-medium text-foreground hover:underline">
                {program.name}
              </Link>
              <span className="text-xs text-muted">{program.contactEmail}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
