"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DURATION_LABELS } from "@/lib/duration";
import type { DurationType } from "@/app/generated/prisma/enums";

export type ProgramFormValues = {
  id?: string;
  slug?: string;
  name: string;
  description: string;
  organization: string;
  location: string;
  durationType: DurationType;
  durationText: string;
  cost: string;
  signupInstructions: string;
  signupUrl: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  tags: string;
  logoUrl?: string | null;
};

const EMPTY: ProgramFormValues = {
  name: "",
  description: "",
  organization: "",
  location: "",
  durationType: "TEN_DAY",
  durationText: "",
  cost: "",
  signupInstructions: "",
  signupUrl: "",
  contactEmail: "",
  contactPhone: "",
  contactWebsite: "",
  tags: "",
  logoUrl: null,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40";

export default function ProgramForm({
  initial,
}: {
  initial?: ProgramFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProgramFormValues>(initial ?? EMPTY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof ProgramFormValues>(key: K, value: ProgramFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key === "id" || key === "slug" || value == null) continue;
      formData.set(key, String(value));
    }
    if (logoFile) formData.set("logo", logoFile);

    try {
      const res = await fetch(
        isEdit ? `/api/programs/${initial!.id}` : "/api/programs",
        { method: isEdit ? "PATCH" : "POST", body: formData }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong");
      }
      const body = await res.json();

      if (isEdit) {
        // PATCH returns { pending, program } (moderator, applied immediately)
        // or { pending, slug } (queued for review — nothing changed yet).
        const suffix = body.pending ? "?editPending=1" : "";
        router.push(`/programs/${initial!.slug}${suffix}`);
      } else {
        // POST returns the created program directly (status PENDING or PUBLISHED).
        const suffix = body.status === "PENDING" ? "?created=pending" : "";
        router.push(`/programs/${body.slug}${suffix}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Field label="Program name">
        <input
          required
          className={inputClass}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field label="Description">
        <textarea
          required
          rows={4}
          className={inputClass}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Organization">
          <input
            className={inputClass}
            value={values.organization}
            onChange={(e) => set("organization", e.target.value)}
          />
        </Field>
        <Field label="Location">
          <input
            className={inputClass}
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Duration type">
          <select
            className={inputClass}
            value={values.durationType}
            onChange={(e) =>
              set("durationType", e.target.value as DurationType)
            }
          >
            {Object.entries(DURATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duration details">
          <input
            placeholder="e.g. 10 days"
            className={inputClass}
            value={values.durationText}
            onChange={(e) => set("durationText", e.target.value)}
          />
        </Field>
        <Field label="Cost">
          <input
            placeholder="e.g. Free, or $30,000"
            className={inputClass}
            value={values.cost}
            onChange={(e) => set("cost", e.target.value)}
          />
        </Field>
      </div>

      <Field label="How to sign up">
        <textarea
          rows={2}
          className={inputClass}
          value={values.signupInstructions}
          onChange={(e) => set("signupInstructions", e.target.value)}
        />
      </Field>
      <Field label="Signup URL">
        <input
          type="url"
          placeholder="https://..."
          className={inputClass}
          value={values.signupUrl}
          onChange={(e) => set("signupUrl", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Contact email">
          <input
            type="email"
            className={inputClass}
            value={values.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </Field>
        <Field label="Contact phone">
          <input
            className={inputClass}
            value={values.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
          />
        </Field>
        <Field label="Contact website">
          <input
            type="url"
            placeholder="https://..."
            className={inputClass}
            value={values.contactWebsite}
            onChange={(e) => set("contactWebsite", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Tags / hashtags (comma separated)">
        <input
          placeholder="gap-year, leadership, army"
          className={inputClass}
          value={values.tags}
          onChange={(e) => set("tags", e.target.value)}
        />
      </Field>

      <Field label="Logo">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className={inputClass}
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
        />
        {values.logoUrl && !logoFile && (
          <span className="text-xs text-black/50 dark:text-white/50">
            Current logo will be kept unless you choose a new file.
          </span>
        )}
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-lg bg-foreground px-5 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving..." : isEdit ? "Save changes" : "Create program"}
      </button>
    </form>
  );
}
