"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { DurationType } from "@/app/generated/prisma/enums";
import { DURATION_LABELS } from "@/lib/duration";

type SearchBarProps = {
  tags: { slug: string; name: string }[];
};

export default function SearchBar({ tags }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const activeTag = searchParams.get("tag") ?? "";
  const activeDuration = searchParams.get("duration") ?? "";

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/programs?${params.toString()}`);
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, keyword, or #hashtag..."
          className="w-full rounded-lg border border-black/10 bg-transparent px-4 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          className="rounded-lg bg-foreground px-4 py-2 text-sm text-background hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <select
          value={activeDuration}
          onChange={(e) => updateParams({ duration: e.target.value || null })}
          className="rounded-full border border-black/10 bg-transparent px-3 py-1 text-xs dark:border-white/15"
        >
          <option value="">All durations</option>
          {Object.entries(DURATION_LABELS).map(([value, label]) => (
            <option key={value} value={value as DurationType}>
              {label}
            </option>
          ))}
        </select>

        {tags.slice(0, 20).map((tag) => (
          <button
            key={tag.slug}
            onClick={() =>
              updateParams({ tag: activeTag === tag.slug ? null : tag.slug })
            }
            className={`rounded-full border px-3 py-1 text-xs transition ${
              activeTag === tag.slug
                ? "border-foreground bg-foreground text-background"
                : "border-black/10 hover:border-black/30 dark:border-white/15 dark:hover:border-white/40"
            }`}
          >
            #{tag.slug}
          </button>
        ))}
      </div>
    </div>
  );
}
