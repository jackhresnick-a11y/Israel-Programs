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
        "rounded border border-border bg-surface transition-colors duration-[120ms] ease-out",
        interactive && "hover:border-accent",
        className
      )}
      {...props}
    />
  );
}
