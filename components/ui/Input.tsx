import { cn } from "@/lib/cn";

export const fieldClass =
  "rounded border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors duration-[120ms] ease-out focus:border-accent-hover";

export default function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}
