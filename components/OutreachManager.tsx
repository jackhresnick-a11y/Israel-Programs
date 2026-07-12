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
  subject: string;
  body: string;
  edited: boolean;
  note: string | null;
  sentAt: Date | null;
};

type EligibleProgram = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  durationType: string;
  contactEmail: string | null;
  contactEmailSource: string | null;
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
  const [busy, setBusy] = useState<string | null>(null); // a coarse "something is loading" key

  const noDraft = programs.filter((p) => !p.outreachEmail);
  const drafts = programs.filter((p) => p.outreachEmail?.status === "DRAFT");
  const approved = programs.filter((p) => p.outreachEmail?.status === "APPROVED");
  const actioned = programs.filter(
    (p) => p.outreachEmail && ["SENT", "BOUNCED", "REPLIED", "WRONG_CONTACT"].includes(p.outreachEmail.status)
  );

  function updateOutreach(programId: string, patch: Partial<OutreachEmail>) {
    setPrograms((cur) =>
      cur.map((p) => (p.id === programId && p.outreachEmail ? { ...p, outreachEmail: { ...p.outreachEmail, ...patch } } : p))
    );
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
  }

  async function saveEdit(program: EligibleProgram) {
    if (!program.outreachEmail) return;
    setBusy(program.outreachEmail.id);
    try {
      const res = await fetch(`/api/admin/outreach/${program.outreachEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      updateOutreach(program.id, { subject: editSubject, body: editBody, edited: true });
      setEditingId(null);
      toast("Draft updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save draft");
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

  const draftSelectionEmails = useMemo(
    () => drafts.filter((p) => p.outreachEmail && selectedDraftIds.has(p.outreachEmail.id)),
    [drafts, selectedDraftIds]
  );

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
            disabled={selectedDraftIds.size === 0 || busy === "approve"}
            onClick={() => approveIds(draftSelectionEmails.map((p) => p.outreachEmail!.id))}
          >
            Approve selected ({selectedDraftIds.size})
          </Button>
        </div>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {drafts.length === 0 && <p className="p-4 text-sm text-muted">No drafts.</p>}
          {drafts.map((program) => {
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
                  {oe.edited && <Badge tone="info">Hand-edited</Badge>}
                  <span className="text-xs text-muted">{oe.toEmail}</span>
                </div>
                {isEditing ? (
                  <div className="flex flex-col gap-2 pl-7">
                    <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
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
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {approved.length === 0 && <p className="p-4 text-sm text-muted">Nothing approved yet.</p>}
          {approved.map((program) => (
            <div key={program.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/programs/${program.slug}/edit`} className="font-medium text-foreground hover:underline">
                  {program.name}
                </Link>
                <span className="ml-2 text-xs text-muted">{program.outreachEmail!.toEmail}</span>
              </div>
              <Badge tone={STATUS_TONE.APPROVED}>Approved</Badge>
            </div>
          ))}
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
