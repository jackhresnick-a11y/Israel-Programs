"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { ReferrerTokenRow } from "@/lib/pollTokens";

type ProgramOption = { id: string; name: string; slug: string };

async function api(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? "Request failed");
  }
  return res.json().catch(() => ({}));
}

function tokenUrl(programSlug: string, token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/rate/${programSlug}?ref=${token}`;
}

export default function PollLinkManager({
  tokens,
  programs,
}: {
  tokens: ReferrerTokenRow[];
  programs: ProgramOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [blurbTokenId, setBlurbTokenId] = useState<string | null>(null);

  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [maxResponses, setMaxResponses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [minting, setMinting] = useState(false);

  const programsById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);

  async function handleMint() {
    if (!programId || !label.trim()) return;
    setMinting(true);
    setError(null);
    try {
      await api("/api/admin/polls/links", "POST", {
        programId,
        label: label.trim(),
        note: note.trim() || null,
        maxResponses: maxResponses ? Number(maxResponses) : null,
        expiresAt: expiresAt || null,
      });
      setLabel("");
      setNote("");
      setMaxResponses("");
      setExpiresAt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mint link");
    } finally {
      setMinting(false);
    }
  }

  async function handleRevoke(token: ReferrerTokenRow) {
    if (!confirm(`Revoke the link for "${token.label}"? Anyone who still has it can submit, but every response will be flagged for review.`)) {
      return;
    }
    setBusyId(token.id);
    setError(null);
    try {
      await api(`/api/admin/polls/links/${token.id}`, "PATCH", { revoked: true });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke link");
    } finally {
      setBusyId(null);
    }
  }

  async function copyToClipboard(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">Mint a new outreach link</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Program
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-64">
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Label (who you&rsquo;re giving this to)
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. 2023 alumni WhatsApp group"
              className="w-64"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Max responses (optional)
            <Input
              type="number"
              min={1}
              value={maxResponses}
              onChange={(e) => setMaxResponses(e.target.value)}
              placeholder="Uncapped"
              className="w-32"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Expires (optional)
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-40"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Note (optional, admin-only)
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Any context worth remembering about this link"
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={!programId || !label.trim() || minting}
          onClick={handleMint}
        >
          {minting ? "Minting..." : "Mint link"}
        </Button>
      </Card>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {tokens.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">No links minted yet.</p>
        )}
        {tokens.map((token) => {
          const program = programsById.get(token.programId);
          const url = program ? tokenUrl(program.slug, token.token) : tokenUrl(token.programSlug, token.token);
          const expired = token.expiresAt !== null && token.expiresAt < new Date();
          const overCap = token.maxResponses !== null && token.countedCount + token.flaggedCount >= token.maxResponses;
          return (
            <div key={token.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{token.label}</span>
                <Badge tone="tag">{token.programName}</Badge>
                {token.revoked && <Badge tone="danger">Revoked</Badge>}
                {expired && !token.revoked && <Badge tone="warning">Expired</Badge>}
                {overCap && <Badge tone="warning">Over cap</Badge>}
                <span className="ml-auto text-xs text-muted">
                  {token.countedCount} counted · {token.flaggedCount} flagged
                  {token.maxResponses !== null ? ` · cap ${token.maxResponses}` : ""}
                </span>
              </div>
              {token.note && <p className="text-xs text-muted">{token.note}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={url} className="max-w-md flex-1 text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="secondary" size="sm" onClick={() => copyToClipboard(token.id, url)}>
                  {copiedId === token.id ? "Copied!" : "Copy link"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBlurbTokenId((current) => (current === token.id ? null : token.id))}
                >
                  {blurbTokenId === token.id ? "Hide blurb" : "Generate blurb"}
                </Button>
                {!token.revoked && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busyId === token.id}
                    onClick={() => handleRevoke(token)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
              {blurbTokenId === token.id && (
                <BlurbGenerator programName={token.programName} url={url} tokenId={token.id} onCopy={copyToClipboard} copiedId={copiedId} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlurbGenerator({
  programName,
  url,
  tokenId,
  onCopy,
  copiedId,
}: {
  programName: string;
  url: string;
  tokenId: string;
  onCopy: (id: string, text: string) => void;
  copiedId: string | null;
}) {
  const blurbId = `blurb:${tokenId}`;
  const [line1, setLine1] = useState(`Quick favor — got 2 minutes to rate ${programName}?`);
  const [line2, setLine2] = useState("Your honest feedback really helps future participants decide.");

  const composed = `${line1}\n${line2}\n${url}`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Line 1
        <Input value={line1} onChange={(e) => setLine1(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Line 2
        <Input value={line2} onChange={(e) => setLine2(e.target.value)} />
      </label>
      <Textarea readOnly value={composed} rows={4} className="text-xs" />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => onCopy(blurbId, composed)}
      >
        {copiedId === blurbId ? "Copied!" : "Copy blurb + link"}
      </Button>
    </div>
  );
}
