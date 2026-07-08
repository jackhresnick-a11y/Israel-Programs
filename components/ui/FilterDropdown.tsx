"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type FilterDropdownTint = "accent" | "info" | "success" | "warning" | "danger";

type Option = { value: string; label: string };

type FilterDropdownProps = {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  tint: FilterDropdownTint;
};

// Subtle per-dropdown hover/open hue, built entirely from existing palette tokens so
// the bar stays inside the site's theme rather than reading as a bolted-on nav.
const TINTS: Record<
  FilterDropdownTint,
  { hover: string; active: string; ring: string; count: string }
> = {
  accent: {
    hover: "hover:border-accent hover:bg-accent/10",
    active: "border-accent bg-accent/10",
    ring: "focus-visible:ring-accent",
    count: "bg-accent text-accent-foreground",
  },
  info: {
    hover: "hover:border-info hover:bg-info-bg",
    active: "border-info bg-info-bg",
    ring: "focus-visible:ring-info",
    count: "bg-info text-white",
  },
  success: {
    hover: "hover:border-success hover:bg-success-bg",
    active: "border-success bg-success-bg",
    ring: "focus-visible:ring-success",
    count: "bg-success text-white",
  },
  warning: {
    hover: "hover:border-warning hover:bg-warning-bg",
    active: "border-warning bg-warning-bg",
    ring: "focus-visible:ring-warning",
    count: "bg-warning text-accent-foreground",
  },
  danger: {
    hover: "hover:border-danger hover:bg-danger-bg",
    active: "border-danger bg-danger-bg",
    ring: "focus-visible:ring-danger",
    count: "bg-danger text-white",
  },
};

export default function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  tint,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = TINTS[tint];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open ? tone.active : "border-border bg-surface text-foreground shadow-sm",
          tone.hover,
          tone.ring
        )}
      >
        {label}
        {selected.length > 0 && (
          <span
            className={cn(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
              tone.count
            )}
          >
            {selected.length}
          </span>
        )}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-48 rounded-lg border border-border bg-surface p-1.5 shadow-sm">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => onToggle(option.value)}
                className="accent-accent"
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
