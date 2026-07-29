"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
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
      <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-surface px-4 py-2 text-sm">
        {selected.map((p) => (
          <Badge key={p.slug} tone="tag" className="gap-1">
            {p.name}
            <button
              onClick={() => remove(p.slug)}
              aria-label={`Remove ${p.name} from comparison`}
              className="ml-1 hover:text-danger"
            >
              <X width={16} height={16} strokeWidth={1.5} />
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
