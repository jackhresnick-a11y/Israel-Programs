import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

// Read-only star display (list rows, review cards) -- the interactive 1-5 picker
// (components/polls/QuestionInput.tsx's STARS question type, ReviewForm.tsx's
// rating <select>) has its own markup since a <select><option> can't render an
// icon and the poll picker needs per-star click handlers.
export default function StarRating({
  rating,
  max = 5,
  size = 16,
  className,
}: {
  rating: number;
  max?: number;
  size?: 16 | 20;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-accent-hover", className)}
      aria-label={`${rating} out of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          width={size}
          height={size}
          strokeWidth={1.5}
          aria-hidden="true"
          className={i < rating ? "fill-current" : "text-border"}
        />
      ))}
    </span>
  );
}
