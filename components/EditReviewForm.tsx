"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DURATION_LABELS } from "@/lib/duration";
import { TRAVEL_TYPE_LABELS } from "@/lib/facets";
import { FIELD_LABELS } from "@/lib/diff";

type Decision = {
  fieldName: string;
  proposedValue: string | null;
  finalValue: string | null;
};

type RowState = { decision: "ACCEPTED" | "REJECTED"; finalValue: string };

function humanizeFieldName(fieldName: string): string {
  if (fieldName.startsWith("tag:added:")) return `Add tag: #${fieldName.slice("tag:added:".length)}`;
  if (fieldName.startsWith("tag:removed:")) return `Remove tag: #${fieldName.slice("tag:removed:".length)}`;
  return FIELD_LABELS[fieldName] ?? fieldName;
}

function displayValue(fieldName: string, value: string): string {
  if (fieldName === "durationType") return DURATION_LABELS[value as keyof typeof DURATION_LABELS] ?? value;
  if (fieldName === "travelType") return TRAVEL_TYPE_LABELS[value] ?? "Not specified";
  if (fieldName === "hasScholarship" || fieldName === "hasCollegeCredit") return value === "true" ? "Yes" : "No";
  return value;
}

function ValueEditor({
  fieldName,
  value,
  onChange,
}: {
  fieldName: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputClass =
    "w-full rounded-lg border border-blue-100 bg-transparent px-2 py-1 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500";

  if (fieldName.startsWith("tag:")) {
    return <p className="text-sm">{displayValue(fieldName, value)}</p>;
  }
  if (fieldName === "durationType") {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(DURATION_LABELS).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  if (fieldName === "travelType") {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not specified</option>
        {Object.entries(TRAVEL_TYPE_LABELS).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  if (fieldName === "hasScholarship" || fieldName === "hasCollegeCredit") {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  return (
    <textarea
      rows={2}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function EditReviewForm({
  editId,
  programSlug,
  decisions,
  submitterId,
  submitterName,
}: {
  editId: string;
  programSlug: string;
  decisions: Decision[];
  submitterId: string;
  submitterName: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      decisions.map((d) => [
        d.fieldName,
        { decision: "ACCEPTED" as const, finalValue: d.finalValue ?? d.proposedValue ?? "" },
      ])
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [banning, setBanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRow(fieldName: string, update: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [fieldName]: { ...prev[fieldName], ...update } }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = decisions.map((d) => ({
        fieldName: d.fieldName,
        decision: rows[d.fieldName].decision,
        finalValue: rows[d.fieldName].finalValue,
      }));
      const res = await fetch(`/api/admin/edits/${editId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to apply changes");
      }
      router.push(`/programs/${programSlug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply changes");
      setSubmitting(false);
    }
  }

  async function handleBan() {
    if (!confirm(`Ban ${submitterName}? They will no longer be able to submit programs or edits.`)) return;
    setBanning(true);
    const res = await fetch(`/api/admin/users/${submitterId}/ban`, { method: "POST" });
    setBanning(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {decisions.map((d) => {
          const row = rows[d.fieldName];
          return (
            <div
              key={d.fieldName}
              className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between ${
                row.decision === "REJECTED"
                  ? "border-red-200 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/10"
                  : "border-blue-100 dark:border-blue-950"
              }`}
            >
              <div className="flex-1">
                <p className="text-xs font-medium text-black/50 dark:text-white/50">
                  {humanizeFieldName(d.fieldName)}
                </p>
                <p className="text-xs text-black/40 dark:text-white/40">
                  proposed: {displayValue(d.fieldName, d.proposedValue ?? "")}
                </p>
                <div className="mt-1">
                  <ValueEditor
                    fieldName={d.fieldName}
                    value={row.finalValue}
                    onChange={(v) => setRow(d.fieldName, { finalValue: v })}
                  />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setRow(d.fieldName, { decision: "ACCEPTED" })}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${
                    row.decision === "ACCEPTED"
                      ? "bg-amber-500 text-slate-900"
                      : "border border-blue-100 hover:border-amber-400 dark:border-blue-950"
                  }`}
                >
                  Accept
                </button>
                <button
                  onClick={() => setRow(d.fieldName, { decision: "REJECTED" })}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${
                    row.decision === "REJECTED"
                      ? "bg-red-500 text-white"
                      : "border border-blue-100 hover:border-red-400 dark:border-blue-950"
                  }`}
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-blue-100 pt-4 dark:border-blue-950">
        <button
          onClick={handleBan}
          disabled={banning}
          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
        >
          {banning ? "Banning..." : `Ban ${submitterName}`}
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {submitting ? "Applying..." : "Apply approved changes"}
        </button>
      </div>
    </div>
  );
}
