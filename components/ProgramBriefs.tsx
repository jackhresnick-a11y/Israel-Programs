import type { PublishedBrief } from "@/lib/briefs";

/**
 * PUBLISHED admin-authored briefs for one program, rendered between the description
 * paragraph and the "Best for someone who wants" strip -- server-rendered in the HTML,
 * no client toggle. Renders nothing at all (not an empty container) when the program has
 * no published briefs, same "render nothing rather than an empty box" rule
 * components/polls/BestForStrip.tsx uses. Multiple briefs stack, each under its own
 * brief-type name as a small heading -- `briefs` is already ordered by BriefType.sortOrder
 * (see lib/briefs.ts's getPublishedBriefsForProgram).
 */
export default function ProgramBriefs({ briefs }: { briefs: PublishedBrief[] }) {
  if (briefs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {briefs.map((brief) => (
        <div key={brief.typeSlug} className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{brief.typeName}</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{brief.text}</p>
        </div>
      ))}
    </div>
  );
}
