"use client";

import { useCompare } from "./CompareContext";

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
      className={`absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm backdrop-blur ${
        checked
          ? "border-amber-500 bg-amber-500 text-slate-900 font-medium"
          : "border-blue-100 bg-white/90 text-black/60 dark:border-blue-950 dark:bg-black/70 dark:text-white/60"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      title={disabled ? "You can compare up to 3 programs at a time" : "Add to comparison"}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => toggle({ slug, name })}
        className="h-3 w-3 accent-amber-500"
      />
      Compare
    </label>
  );
}
