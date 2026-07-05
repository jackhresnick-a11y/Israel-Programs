"use client";

import { useRouter } from "next/navigation";

export default function CompareAddControl({
  currentSlugs,
  options,
}: {
  currentSlugs: string[];
  options: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const available = options.filter((o) => !currentSlugs.includes(o.slug));

  if (available.length === 0) return null;

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (!e.target.value) return;
        const next = [...currentSlugs, e.target.value];
        router.push(`/compare?slugs=${encodeURIComponent(next.join(","))}`);
      }}
      className="w-full rounded-lg border border-blue-100 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-blue-950 dark:focus:border-amber-500"
    >
      <option value="" disabled>
        + Add a program to compare
      </option>
      {available.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
