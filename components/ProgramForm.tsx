"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TRAVEL_TYPE_LABELS } from "@/lib/facets";
import type { DurationType } from "@/app/generated/prisma/enums";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import TagPicker, { type TagOption, type TagCategoryOption } from "@/components/ui/TagPicker";
import { useToast } from "@/components/ui/Toast";

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
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function ProgramForm({
  initial,
  allTags,
  categories,
  durationOptions,
}: {
  initial?: ProgramFormValues;
  allTags: TagOption[];
  categories: TagCategoryOption[];
  /** Ordered, admin-editable duration options (see lib/duration.ts's listDurationOptions)
   * -- rendered in this order so an admin's reordering in app/admin/tags applies here too. */
  durationOptions: { value: DurationType; label: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
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
        if (body.pending) {
          toast("Your edits have been sent for review and will show up after moderator approval");
        }
        router.push(`/programs/${initial!.slug}`);
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
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Field label="Program name">
        <Input
          required
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field label="Description">
        <Textarea
          required
          rows={4}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field label="Who is this program good for?">
        <Textarea
          rows={3}
          placeholder={
            'e.g. "Ideal for first-time visitors who want a broad overview; less suited to those seeking intensive text study." Describe the ideal participant — background, goals, learning style — rather than repeating cost, dates, or affiliation.'
          }
          value={values.goodFor}
          onChange={(e) => set("goodFor", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Organization">
          <Input
            value={values.organization}
            onChange={(e) => set("organization", e.target.value)}
          />
        </Field>
        <Field label="Location">
          <Input
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Duration type">
          <Select
            value={values.durationType}
            onChange={(e) =>
              set("durationType", e.target.value as DurationType)
            }
          >
            {durationOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duration details">
          <Input
            placeholder="e.g. 10 days"
            value={values.durationText}
            onChange={(e) => set("durationText", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.hasScholarship}
            onChange={(e) => set("hasScholarship", e.target.checked)}
            className="accent-accent"
          />
          Scholarships / financial aid available
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.hasCollegeCredit}
            onChange={(e) => set("hasCollegeCredit", e.target.checked)}
            className="accent-accent"
          />
          College credit available
        </label>
        <Field label="Travel">
          <Select
            value={values.travelType}
            onChange={(e) => set("travelType", e.target.value)}
          >
            <option value="">Not specified</option>
            {Object.entries(TRAVEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="How to sign up">
        <Textarea
          rows={2}
          value={values.signupInstructions}
          onChange={(e) => set("signupInstructions", e.target.value)}
        />
      </Field>
      <Field label="Signup URL">
        <Input
          type="url"
          placeholder="https://..."
          value={values.signupUrl}
          onChange={(e) => set("signupUrl", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Contact email">
          <Input
            type="email"
            value={values.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </Field>
        <Field label="Contact phone">
          <Input
            value={values.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
          />
        </Field>
        <Field label="Contact website">
          <Input
            type="url"
            placeholder="https://..."
            value={values.contactWebsite}
            onChange={(e) => set("contactWebsite", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Tags">
        <TagPicker
          value={values.tags}
          onChange={(next) => set("tags", next)}
          allTags={allTags}
          categories={categories}
        />
      </Field>

      <Field label="Logo">
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
        />
        {values.logoUrl && !logoFile && (
          <span className="text-xs text-muted">
            Current logo will be kept unless you choose a new file.
          </span>
        )}
      </Field>

      <Field label="Video (optional)">
        <Input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
        />
        <span className="text-xs text-muted">
          MP4, WebM, or MOV, up to 200MB. You can also add more videos later
          from the program page.
        </span>
      </Field>

      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : isEdit ? "Save changes" : "Create program"}
      </Button>
    </form>
  );
}
