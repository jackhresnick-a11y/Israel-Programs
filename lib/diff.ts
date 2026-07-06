import slugify from "slugify";
import { DURATION_LABELS } from "@/lib/duration";
import { TRAVEL_TYPE_LABELS } from "@/lib/facets";
import type { ProgramInput } from "@/lib/programs";
import type { DurationType } from "@/app/generated/prisma/enums";

export type DiffToken = { type: "same" | "added" | "removed"; text: string };

export type FieldDiff = {
  field: string;
  label: string;
  tokens: DiffToken[];
};

export type TagDiff = {
  added: string[];
  removed: string[];
};

/** Word-level LCS diff, GitHub-style (merges adjacent same-type tokens). */
export function wordDiff(oldText: string, newText: string): DiffToken[] {
  const oldWords = oldText.split(/(\s+)/).filter(Boolean);
  const newWords = newText.split(/(\s+)/).filter(Boolean);
  const m = oldWords.length;
  const n = newWords.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldWords[i] === newWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldWords[i] === newWords[j]) {
      raw.push({ type: "same", text: oldWords[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "removed", text: oldWords[i] });
      i++;
    } else {
      raw.push({ type: "added", text: newWords[j] });
      j++;
    }
  }
  while (i < m) raw.push({ type: "removed", text: oldWords[i++] });
  while (j < n) raw.push({ type: "added", text: newWords[j++] });

  const merged: DiffToken[] = [];
  for (const tok of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === tok.type) last.text += tok.text;
    else merged.push({ ...tok });
  }
  return merged;
}

type OriginalProgram = {
  name: string;
  description: string;
  goodFor: string | null;
  organization: string | null;
  location: string | null;
  durationType: DurationType;
  durationText: string | null;
  cost: string | null;
  signupInstructions: string | null;
  signupUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWebsite: string | null;
  hasScholarship: boolean | null;
  hasCollegeCredit: boolean | null;
  travelType: string | null;
  tags: { name: string; slug: string }[];
};

const TEXT_FIELDS: { key: keyof ProgramInput; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "goodFor", label: "Who It's For" },
  { key: "organization", label: "Organization" },
  { key: "location", label: "Location" },
  { key: "durationText", label: "Duration Details" },
  { key: "cost", label: "Cost" },
  { key: "signupInstructions", label: "How to Sign Up" },
  { key: "signupUrl", label: "Signup URL" },
  { key: "contactEmail", label: "Contact Email" },
  { key: "contactPhone", label: "Contact Phone" },
  { key: "contactWebsite", label: "Contact Website" },
];

const BOOLEAN_FIELDS: { key: keyof ProgramInput; label: string }[] = [
  { key: "hasScholarship", label: "Scholarships / Financial Aid" },
  { key: "hasCollegeCredit", label: "College Credit" },
];

function yesNo(v: boolean | null | undefined): string {
  return v ? "Yes" : "No";
}

/** Shared field-name -> human label lookup, reused by the review screen. */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries([
  ...TEXT_FIELDS.map(({ key, label }) => [key, label]),
  ...BOOLEAN_FIELDS.map(({ key, label }) => [key, label]),
  ["durationType", "Duration Type"],
  ["travelType", "Travel"],
]);

export function buildFieldDiffs(
  original: OriginalProgram,
  proposed: ProgramInput
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  for (const { key, label } of TEXT_FIELDS) {
    const before = (original[key as keyof OriginalProgram] ?? "") as string;
    const after = (proposed[key] ?? "") as string;
    if (before.trim() === after.trim()) continue;
    diffs.push({ field: key, label, tokens: wordDiff(before, after) });
  }

  if (original.durationType !== proposed.durationType) {
    diffs.push({
      field: "durationType",
      label: "Duration Type",
      tokens: wordDiff(DURATION_LABELS[original.durationType], DURATION_LABELS[proposed.durationType]),
    });
  }

  for (const { key, label } of BOOLEAN_FIELDS) {
    const before = Boolean(original[key as keyof OriginalProgram]);
    const after = Boolean(proposed[key]);
    if (before === after) continue;
    diffs.push({ field: key, label, tokens: wordDiff(yesNo(before), yesNo(after)) });
  }

  const beforeTravel = original.travelType ?? "";
  const afterTravel = proposed.travelType ?? "";
  if (beforeTravel !== afterTravel) {
    diffs.push({
      field: "travelType",
      label: "Travel",
      tokens: wordDiff(
        TRAVEL_TYPE_LABELS[beforeTravel] ?? "Not specified",
        TRAVEL_TYPE_LABELS[afterTravel] ?? "Not specified"
      ),
    });
  }

  return diffs;
}

export function buildTagDiff(
  original: { name: string; slug: string }[],
  proposedTags: string[]
): TagDiff | null {
  const originalSlugs = new Set(original.map((t) => t.slug));
  const proposedSlugified = proposedTags.map((name) => ({
    name,
    slug: slugify(name, { lower: true, strict: true }),
  }));
  const proposedSlugs = new Set(proposedSlugified.map((t) => t.slug));

  const added = proposedSlugified.filter((t) => !originalSlugs.has(t.slug)).map((t) => t.name);
  const removed = original.filter((t) => !proposedSlugs.has(t.slug)).map((t) => t.name);

  if (added.length === 0 && removed.length === 0) return null;
  return { added, removed };
}
