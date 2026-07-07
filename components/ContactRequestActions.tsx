"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function ContactRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markReplied() {
    setBusy(true);
    const res = await fetch(`/api/contact-requests/${id}`, { method: "PATCH" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={markReplied} disabled={busy} className="w-fit">
      {busy ? "Saving..." : "Mark as replied"}
    </Button>
  );
}
