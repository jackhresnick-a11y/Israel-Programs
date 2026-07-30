"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { fieldClass } from "./Input";

/**
 * A textarea that starts at 3 rows and grows with its content instead of clipping text
 * inside a fixed-height box (style guide §8.2/§6 "Form fields" -- "Textareas auto-grow
 * from 3 rows; they are never fixed-height"). Height is driven off `scrollHeight` rather
 * than a CSS-only trick since the field also needs to shrink back down when text is
 * deleted, which `scrollHeight` alone won't do without first resetting to `auto`.
 */
export default function AutoGrowTextarea({
  className,
  value,
  onChange,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
      rows={3}
      value={value}
      onChange={onChange}
      className={cn(fieldClass, "resize-none overflow-hidden", className)}
      {...props}
    />
  );
}
