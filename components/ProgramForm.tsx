"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DURATION_LABELS } from "@/lib/duration";
import { TRAVEL_TYPE_LABELS } from "@/lib/facets";
import type { DurationType } from "@/app/generated/prisma/enums";

export type ProgramFormValues = {
  id?: string;
  slug?: string;
  name: string;
  description: string;
  goodFor: string;
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
  hasScholarship: boolean;
  hasCollegeCredit: boolean;
  travelType: string;
  tags: string;
  logoUrl?: string | null;
};

const EMPTY: ProgramFormValues = {
  name: "",
  description: "",
  goodFor: "",
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
  hasScholarship: false,
  hasCollegeCredit: false,
  travelType: "",
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
  "rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500";

export default function ProgramForm({
  initial,
}: {
  initial?: ProgramFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProgramFormValues>(initial ?? EMPTY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
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

      // Videos attach to an existing program row, so upload happens as a
      // follow-up request once we know the program's id — either the one
      // just created, or the one already being edited (edits to an
      // existing program can still take a video immediately; only the
      // text-field changes are queued for non-moderators).
      if (videoFile) {
        const programId = isEdit ? initial!.id : body.id;
        const videoForm = new FormData();
        videoForm.set("video", videoFile);
        const videoRes = await fetch(`/api/programs/${programId}/videos`, {
          method: "POST",
          body: videoForm,
        });
        if (!videoRes.ok) {
          const videoErrBody = await videoRes.json().catch(() => ({}));
          console.error("Video upload failed:", videoErrBody.error);
        }
      }

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

      <Field label="Who is this program good for?">
        <textarea
          rows={3}
          placeholder={
            'e.g. "Ideal for first-time visitors who want a broad overview; less suited to those seeking intensive text study." Describe the ideal participant — background, goals, learning style — rather than repeating cost, dates, or affiliation.'
          }
          className={inputClass}
          value={values.goodFor}
          onChange={(e) => set("goodFor", e.target.value)}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.hasScholarship}
            onChange={(e) => set("hasScholarship", e.target.checked)}
          />
          Scholarships / financial aid available
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.hasCollegeCredit}
            onChange={(e) => set("hasCollegeCredit", e.target.checked)}
          />
          College credit available
        </label>
        <Field label="Travel">
          <select
            className={inputClass}
            value={values.travelType}
            onChange={(e) => set("travelType", e.target.value)}
          >
            <option value="">Not specified</option>
            {Object.entries(TRAVEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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

      <Field label="Video (optional)">
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className={inputClass}
          onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
        />
        <span className="text-xs text-black/50 dark:text-white/50">
          MP4, WebM, or MOV, up to 200MB. You can also add more videos later
          from the program page.
        </span>
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
      >
        {submitting ? "Saving..." : isEdit ? "Save changes" : "Create program"}
      </button>
    </form>
  );
}
