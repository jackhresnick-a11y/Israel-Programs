import { cn } from "@/lib/cn";

type CardProps<T extends React.ElementType> = {
  as?: T;
  interactive?: boolean;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "interactive">;

export default function Card<T extends React.ElementType = "div">({
  as,
  interactive,
  className,
  ...props
}: CardProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm transition",
        interactive && "hover:-translate-y-0.5 hover:border-accent hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}
