import { cn } from "@/lib/cn";
import { fieldClass } from "./Input";

export default function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, className)} {...props} />;
}
