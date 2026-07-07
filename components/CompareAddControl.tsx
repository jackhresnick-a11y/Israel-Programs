"use client";

import { useRouter } from "next/navigation";
import Select from "@/components/ui/Select";

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
    <Select
      defaultValue=""
      onChange={(e) => {
        if (!e.target.value) return;
        const next = [...currentSlugs, e.target.value];
        router.push(`/compare?slugs=${encodeURIComponent(next.join(","))}`);
      }}
      className="w-full"
    >
      <option value="" disabled>
        + Add a program to compare
      </option>
      {available.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}
