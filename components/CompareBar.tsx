"use client";

import { useRouter } from "next/navigation";
import { useCompare } from "./CompareContext";
import Badge from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";

export default function CompareBar() {
  const { selected, remove } = useCompare();
  const router = useRouter();

  if (selected.length < 2) return null;

  const slugs = selected.map((p) => p.slug).join(",");

  return (
    <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg">
        {selected.map((p) => (
          <Badge key={p.slug} tone="tag" className="gap-1">
            {p.name}
            <button
              onClick={() => remove(p.slug)}
              aria-label={`Remove ${p.name} from comparison`}
              className="ml-0.5 hover:text-danger"
            >
              ×
            </button>
          </Badge>
        ))}
        <button
          onClick={() => router.push(`/compare?slugs=${encodeURIComponent(slugs)}`)}
          className={buttonVariants({ variant: "primary", size: "sm" })}
        >
          Compare ({selected.length})
        </button>
      </div>
    </div>
  );
}
