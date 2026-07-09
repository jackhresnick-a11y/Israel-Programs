"use client";

import { useCompare } from "./CompareContext";
import { cn } from "@/lib/cn";

export default function CompareCheckbox({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const { isSelected, toggle, atLimit } = useCompare();
  const checked = isSelected(slug);
  const disabled = !checked && atLimit;

  return (
    <label
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm backdrop-blur",
        checked
          ? "border-accent bg-accent font-medium text-accent-foreground"
          : "border-border bg-surface/90 text-muted",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
      title={disabled ? "You can compare up to 3 programs at a time" : "Add to comparison"}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => toggle({ slug, name })}
        className="h-3 w-3 accent-accent"
      />
      Compare
    </label>
  );
}
