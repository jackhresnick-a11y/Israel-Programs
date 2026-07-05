"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteProgramButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this program? This cannot be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/programs/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/programs");
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
    >
      {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}
