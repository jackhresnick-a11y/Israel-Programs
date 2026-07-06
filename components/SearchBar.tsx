"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { DurationType } from "@/app/generated/prisma/enums";
import { DURATION_LABELS } from "@/lib/duration";
import { FACETS, type FacetKey } from "@/lib/facets";

type SearchBarProps = {
  tags: { slug: string; name: string }[];
};

const FACET_PARAM: Record<FacetKey, string> = {
  gender: "gender",
  affiliation: "affiliation",
  scholarship: "scholarship",
  collegeCredit: "collegeCredit",
  travel: "travel",
  population: "population",
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
          className="w-full rounded-lg border border-blue-100 bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <select
          value={activeDuration}
          onChange={(e) => updateParams({ duration: e.target.value || null })}
          className="rounded-full border border-blue-100 bg-transparent px-3 py-1 text-xs dark:border-blue-950"
        >
          <option value="">All durations</option>
          {Object.entries(DURATION_LABELS).map(([value, label]) => (
            <option key={value} value={value as DurationType}>
              {label}
            </option>
          ))}
        </select>

        {(Object.keys(FACETS) as FacetKey[]).map((key) => {
          const facet = FACETS[key];
          const param = FACET_PARAM[key];
          const active = searchParams.get(param) ?? "";
          return (
            <select
              key={key}
              value={active}
              onChange={(e) => updateParams({ [param]: e.target.value || null })}
              className="rounded-full border border-blue-100 bg-transparent px-3 py-1 text-xs dark:border-blue-950"
            >
              <option value="">{facet.label}: any</option>
              {facet.options.map((opt) => (
                <option key={opt.slug} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        })}

        {tags.slice(0, 20).map((tag) => (
          <button
            key={tag.slug}
            onClick={() =>
              updateParams({ tag: activeTag === tag.slug ? null : tag.slug })
            }
            className={`rounded-full border px-3 py-1 text-xs transition ${
              activeTag === tag.slug
                ? "border-amber-500 bg-amber-500 text-slate-900 font-medium"
                : "border-blue-100 hover:border-amber-400 dark:border-blue-950 dark:hover:border-amber-500/70"
            }`}
          >
            #{tag.slug}
          </button>
        ))}
      </div>
    </div>
  );
}
