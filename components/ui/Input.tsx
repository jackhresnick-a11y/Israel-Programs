import { cn } from "@/lib/cn";

export const fieldClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent";

export default function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}
