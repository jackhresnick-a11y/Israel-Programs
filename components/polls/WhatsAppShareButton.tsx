"use client";

import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { buildShareMessage, buildWhatsAppHref } from "@/lib/pollShare";
import { emitPollEvent } from "@/lib/pollClientEvents";
import { POLL_SHARE_EVENTS } from "@/lib/pollShared";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * One-tap WhatsApp share on the post-poll thank-you screen, aimed at the respondent's own
 * program group chat. `sharePollLink` is the program's public poll link
 * (lib/pollConfig.ts's getPublicPollLink, relative `/rate/[slug]?ref=[publicToken]`) --
 * never the respondent's own referrer token, which would attribute a whole WhatsApp
 * cascade to one campaign token and risk tripping TOKEN_OVER_CAP /
 * lib/pollUnlock.ts's decideAnonymousStatus into FLAGGED for the very responses this
 * button exists to generate. When a program has no public link on
 * (ProgramPollConfig.pollLinkPublic off), this falls back to the site's /rate picker
 * rather than hiding -- a deliberate choice to always give the respondent something to
 * share, at the cost of not landing a friend on this exact program's poll.
 */
export default function WhatsAppShareButton({
  programName,
  sharePollLink,
  responseId,
}: {
  programName: string;
  sharePollLink: string | null;
  responseId: string | null;
}) {
  const shownRef = useRef(false);

  const isDirect = sharePollLink !== null;
  const absoluteUrl = isDirect ? `${SITE_URL}${sharePollLink}` : `${SITE_URL}/rate`;
  const message = buildShareMessage(programName, isDirect ? "direct" : "generic");
  const href = buildWhatsAppHref(message, absoluteUrl);

  useEffect(() => {
    if (shownRef.current || !responseId) return;
    shownRef.current = true;
    emitPollEvent(POLL_SHARE_EVENTS.SHARE_SHOWN, responseId);
  }, [responseId]);

  function handleClick() {
    emitPollEvent(POLL_SHARE_EVENTS.SHARE_CLICKED, responseId);
    // No preventDefault -- the wa.me navigation must never wait on this fetch;
    // emitPollEvent's keepalive:true is what lets the beacon survive it.
  }

  return (
    <a
      data-poll-share
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={buttonVariants({ variant: "primary", size: "md", className: "min-h-11 w-full sm:w-auto" })}
    >
      <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      Share on WhatsApp
    </a>
  );
}
