"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Review = {
  id: string;
  rating: number;
  text: string;
  reviewerName: string;
  createdAt: string | Date;
};

export default function ReviewList({
  reviews,
  isModerator,
}: {
  reviews: Review[];
  isModerator: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this review?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No reviews yet. Be the first to share your experience.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="rounded-lg border border-black/10 p-4 dark:border-white/10"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-amber-500">
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </span>
              <span className="font-medium">{review.reviewerName}</span>
            </div>
            {isModerator && (
              <button
                onClick={() => handleDelete(review.id)}
                disabled={deletingId === review.id}
                className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                {deletingId === review.id ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">
            {review.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
