"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Video = {
  id: string;
  url: string;
  caption: string | null;
};

export default function VideoList({
  videos,
  isModerator,
}: {
  videos: Video[];
  isModerator: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this video?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  if (videos.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No videos yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {videos.map((video) => (
        <div key={video.id} className="flex flex-col gap-2">
          <video
            src={video.url}
            controls
            className="w-full rounded-lg border border-black/10 dark:border-white/10"
          />
          <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
            <span>{video.caption}</span>
            {isModerator && (
              <button
                onClick={() => handleDelete(video.id)}
                disabled={deletingId === video.id}
                className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                {deletingId === video.id ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
