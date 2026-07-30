import { buttonVariants } from "@/components/ui/Button";
import type { PartnerLinkSlot } from "@/lib/partnerLinksConfig";

/**
 * Renders a single resolved partner CTA, or nothing. Fail-closed: a null slot renders no
 * container and causes no layout shift. Order per the spec: header, description, button,
 * disclosure. Plain text is escaped by React on render. The button reuses the SAME
 * component/class as the "Add Program" button (buttonVariants primary -- the yellow/white
 * variant) rather than any new variant or hardcoded color. Outbound anchor only: no form,
 * no request, no client state.
 *
 * Has no client-only dependency, so it can be rendered from a server component (program /
 * compare / search pages) OR from within the "use client" RateForm's confirmation state.
 */
export default function PartnerCta({ slot }: { slot: PartnerLinkSlot | null }) {
  if (!slot) return null;
  const header = slot.header.trim();
  const description = slot.description.trim();

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-4">
      {header && (
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">{header}</h2>
      )}
      {description && (
        <p className="text-sm leading-relaxed text-foreground/80">{description}</p>
      )}
      <a
        href={slot.url}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "primary", className: "w-full sm:w-auto sm:self-start" })}
      >
        {slot.label}
      </a>
      {slot.showDisclosure && (
        <p className="text-xs text-muted">
          IsraelTrack is an independent partner. We receive no payment for referrals.
        </p>
      )}
    </div>
  );
}
