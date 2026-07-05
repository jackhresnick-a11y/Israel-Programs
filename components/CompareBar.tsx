"use client";

import { useRouter } from "next/navigation";
import { useCompare } from "./CompareContext";

export default function CompareBar() {
  const { selected, remove } = useCompare();
  const router = useRouter();

  if (selected.length < 2) return null;

  const slugs = selected.map((p) => p.slug).join(",");

  return (
    <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm shadow-lg dark:border-blue-950 dark:bg-slate-900">
        {selected.map((p) => (
          <span
            key={p.slug}
            className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          >
            {p.name}
            <button
              onClick={() => remove(p.slug)}
              aria-label={`Remove ${p.name} from comparison`}
              className="ml-0.5 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => router.push(`/compare?slugs=${encodeURIComponent(slugs)}`)}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400"
        >
          Compare ({selected.length})
        </button>
      </div>
    </div>
  );
}
