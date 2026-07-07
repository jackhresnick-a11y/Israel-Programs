import { cn } from "@/lib/cn";

export type BadgeTone =
  | "tag"
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const tones: Record<BadgeTone, string> = {
  tag: "bg-accent/15 text-accent-hover dark:text-accent",
  neutral: "bg-surface-muted text-muted",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export default function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
