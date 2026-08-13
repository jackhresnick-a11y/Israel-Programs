"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { fieldClass } from "./Input";

/** Approximate line-height (in px) of the field's text size -- used only to derive a
 * `min-height` floor from `minRows` below. Doesn't need to be exact: it just has to keep
 * an empty box visibly multi-line instead of collapsing to one row via `scrollHeight`. */
const LINE_HEIGHT_PX = 20;
const VERTICAL_PADDING_PX = 16; // fieldClass's py-2 (0.5rem top + bottom)

/**
 * A textarea that starts at `minRows` (default 3) and grows with its content instead of
 * clipping text inside a fixed-height box (style guide §8.2/§6 "Form fields" -- "Textareas
 * auto-grow from 3 rows; they are never fixed-height"). Height is driven off `scrollHeight`
 * rather than a CSS-only trick since the field also needs to shrink back down when text is
 * deleted, which `scrollHeight` alone won't do without first resetting to `auto`.
 *
 * `minRows` also sets a CSS `min-height` (not just the `rows` attribute) -- `rows` alone
 * only sets the *initial* height before the layout effect below overwrites it from
 * `scrollHeight`, so an empty box would otherwise collapse to one visible line regardless
 * of `rows`. `min-height` wins over the inline `height` the effect sets, so the box can
 * grow past `minRows` but never shrink below it.
 */
export default function AutoGrowTextarea({
  className,
  value,
  onChange,
  minRows = 3,
  style,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={onChange}
      style={{ minHeight: `${minRows * LINE_HEIGHT_PX + VERTICAL_PADDING_PX}px`, ...style }}
      className={cn(fieldClass, "resize-none overflow-hidden", className)}
      {...props}
    />
  );
}
