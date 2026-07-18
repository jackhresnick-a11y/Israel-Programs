"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

/**
 * `link` is the relative /rate URL from lib/pollConfig.ts's getPublicPollLink -- null
 * means pollLinkPublic is off, and the caller (app/programs/[slug]/page.tsx) doesn't
 * render this component at all in that case, same "don't render, don't explain" rule
 * as ProgramFaqSection's empty state. Builds the absolute URL from
 * window.location.origin, same convention as PollLinkManager.tsx's tokenUrl.
 */
export default function PublicPollLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await navigator.clipboard.writeText(`${origin}${link}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={link} className="inline-flex">
        <Button type="button" variant="secondary" size="sm">
          Share / fill out this program&rsquo;s poll
        </Button>
      </a>
      <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
