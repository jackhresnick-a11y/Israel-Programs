import { cn } from "@/lib/cn";

const widths = {
  wide: "max-w-6xl",
  base: "max-w-3xl",
  narrow: "max-w-2xl",
} as const;

type PageContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  width?: keyof typeof widths;
};

export default function PageContainer({
  width = "base",
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-6 py-10",
        widths[width],
        className
      )}
      {...props}
    />
  );
}
