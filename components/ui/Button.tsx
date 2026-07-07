import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "onDark";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "border border-border text-foreground hover:bg-surface-muted",
  ghost: "text-muted hover:text-foreground hover:bg-surface-muted",
  destructive: "border border-danger/30 text-danger hover:bg-danger-bg",
  // For use on the navy Nav header, where surface/foreground tokens (which
  // are theme-adaptive) would be invisible against the always-navy bg-primary.
  onDark: "border border-white/30 text-white hover:bg-white/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2 text-sm",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export default function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={buttonVariants({ variant, size, className })} {...props} />
  );
}
