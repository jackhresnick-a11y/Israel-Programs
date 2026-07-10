"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/Button";

type Status = "VERIFIED" | "BOUNCED" | "WRONG_CONTACT";

/** Bounced/Wrong-contact reasons are worth capturing but not worth blocking the click on -- an admin can always skip the prompt. */
const NOTE_PROMPTS: Partial<Record<Status, string>> = {
  BOUNCED: "Bounce reason (optional):",
  WRONG_CONTACT: "Who did it actually reach? (optional):",
};

export default function EmailVerificationActions({ programId }: { programId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Status | null>(null);

  async function act(status: Status) {
    const prompt = NOTE_PROMPTS[status];
    const note = prompt ? window.prompt(prompt) ?? undefined : undefined;
    setBusy(status);
    const res = await fetch(`/api/admin/programs/${programId}/email-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => act("VERIFIED")}
        disabled={busy !== null}
        className={buttonVariants({ variant: "primary", size: "sm" })}
      >
        {busy === "VERIFIED" ? "Saving..." : "Verified"}
      </button>
      <button
        onClick={() => act("BOUNCED")}
        disabled={busy !== null}
        className={buttonVariants({ variant: "destructive", size: "sm" })}
      >
        {busy === "BOUNCED" ? "Saving..." : "Bounced"}
      </button>
      <button
        onClick={() => act("WRONG_CONTACT")}
        disabled={busy !== null}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        {busy === "WRONG_CONTACT" ? "Saving..." : "Wrong contact"}
      </button>
    </div>
  );
}
