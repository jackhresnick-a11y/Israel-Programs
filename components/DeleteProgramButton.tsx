"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";

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
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
      {deleting ? "Deleting..." : "Delete"}
    </Button>
  );
}
