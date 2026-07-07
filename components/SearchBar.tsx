"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { DurationType } from "@/app/generated/prisma/enums";
import { DURATION_LABELS } from "@/lib/duration";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type SearchBarProps = {
  tags: { slug: string; name: string; category: string | null }[];
};

const CATEGORY_LABELS: Record<string, string> = {
  location: "Location",
  affiliation: "Religious affiliation",
  population: "Participant mix",
  gender: "Gender",
};

// Display order for the categorized clusters; anything uncategorized always
// renders last under "Tags".
const CATEGORY_ORDER = ["gender", "affiliation", "population", "location"];

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-accent bg-accent font-medium text-accent-foreground"
          : "border-border text-foreground/80 hover:border-accent hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export default function SearchBar({ tags }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const activeTags = (searchParams.get("tags") ?? "").split(",").filter(Boolean);
  const activeDuration = searchParams.get("duration") ?? "";
  const hasScholarship = searchParams.get("hasScholarship") === "true";
  const hasCollegeCredit = searchParams.get("hasCollegeCredit") === "true";

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/programs?${params.toString()}`);
  }

  function toggleTag(slug: string) {
    const next = activeTags.includes(slug)
      ? activeTags.filter((t) => t !== slug)
      : [...activeTags, slug];
    updateParams({ tags: next.length > 0 ? next.join(",") : null });
  }

  const byCategory = new Map<string, { slug: string; name: string }[]>();
  const general: { slug: string; name: string }[] = [];
  for (const tag of tags) {
    if (tag.category) {
      const bucket = byCategory.get(tag.category);
      if (bucket) bucket.push(tag);
      else byCategory.set(tag.category, [tag]);
    } else {
      general.push(tag);
    }
  }

  function TagPill({ slug }: { slug: string }) {
    return (
      <Pill
        active={activeTags.includes(slug)}
        label={`#${slug}`}
        onClick={() => toggleTag(slug)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: q || null });
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, keyword, or #hashtag..."
          className="w-full"
        />
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          Search
        </button>
      </form>

      <Select
        value={activeDuration}
        onChange={(e) => updateParams({ duration: e.target.value || null })}
        className="w-fit"
      >
        <option value="">All durations</option>
        {Object.entries(DURATION_LABELS).map(([value, label]) => (
          <option key={value} value={value as DurationType}>
            {label}
          </option>
        ))}
      </Select>

      <div className="flex flex-col gap-2">
        {CATEGORY_ORDER.map((category) => {
          const bucket = byCategory.get(category);
          if (!bucket || bucket.length === 0) return null;
          return (
            <div key={category} className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted">
                {CATEGORY_LABELS[category] ?? category}:
              </span>
              {bucket.map((tag) => (
                <TagPill key={tag.slug} slug={tag.slug} />
              ))}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Details:</span>
          <Pill
            active={hasScholarship}
            label="#scholarship"
            onClick={() => updateParams({ hasScholarship: hasScholarship ? null : "true" })}
          />
          <Pill
            active={hasCollegeCredit}
            label="#college-credit"
            onClick={() => updateParams({ hasCollegeCredit: hasCollegeCredit ? null : "true" })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Tags:</span>
          {general.slice(0, 20).map((tag) => (
            <TagPill key={tag.slug} slug={tag.slug} />
          ))}
        </div>
      </div>
    </div>
  );
}
