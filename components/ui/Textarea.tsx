import { cn } from "@/lib/cn";
import { fieldClass } from "./Input";

export default function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, className)} {...props} />;
}
