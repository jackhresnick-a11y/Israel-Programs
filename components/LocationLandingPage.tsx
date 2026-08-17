import Link from "next/link";
import type { LocationPageData, LocationRoute } from "@/lib/locationPages";
import { LOCATION_FACETS, TYPE_FACETS, canonicalPathFor } from "@/lib/locationPagesContent";
import ProgramCard from "@/components/ProgramCard";
import EntryHeader from "@/components/ui/EntryHeader";
import PageContainer from "@/components/ui/PageContainer";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

/** Shared body for both static route trees (/programs/location/[location] and
 * /programs/type/[programType]/location/[location]) -- kept as one component so the two
 * page shapes can never drift, same reasoning as ThankYouPanel/QuestionWithReview being
 * shared between the poll form's two modes. `data`/`allRoutes` are pre-resolved by the
 * calling route (notFound() happens there, not here), so this component only renders. */
export default function LocationLandingPage({
  typeSlug,
  locationSlug,
  data,
  allRoutes,
}: {
  typeSlug: string | null;
  locationSlug: string;
  data: NonNullable<LocationPageData>;
  allRoutes: LocationRoute[];
}) {
  const { location, type, programs, durationLabelMap, copy, topTags, durationCounts, filterHref } = data;

  const title = type ? `${type.pluralLabel} in ${location.label}` : `Programs in ${location.label}`;

  const metaItems: string[] = [
    `${programs.length} program${programs.length === 1 ? "" : "s"}`,
    ...(type ? [type.label] : []),
    location.label,
  ];

  const durationSummary = Object.entries(durationCounts)
    .map(([value, count]) => ({ label: durationLabelMap[value as keyof typeof durationLabelMap], count }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  // Related pages: every other TYPE_FACET in this same location, and this same type (or
  // "all types") in every other location -- restricted to routes that actually cleared
  // the threshold, so a related link is never a dead 404.
  const liveRouteKeys = new Set(allRoutes.map((r) => `${r.typeSlug ?? ""}::${r.locationSlug}`));
  const isLive = (t: string | null, l: string) => liveRouteKeys.has(`${t ?? ""}::${l}`);

  const sameLocationOtherTypes = TYPE_FACETS.filter(
    (t) => t.slug !== typeSlug && isLive(t.slug, locationSlug)
  );
  const sameTypeOtherLocations = LOCATION_FACETS.filter(
    (l) => l.slug !== locationSlug && isLive(typeSlug, l.slug)
  );
  const showAllTypesInLocation = typeSlug !== null && isLive(null, locationSlug);

  return (
    <PageContainer width="wide">
      <EntryHeader title={title} description={copy.intro}>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.06em] text-muted">
          {metaItems.join(" · ")}
        </p>
      </EntryHeader>

      {(topTags.length > 0 || durationSummary.length > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-6">
          {topTags.map((tag) => (
            <Badge key={tag.slug} tone="neutral">
              {tag.name} · {tag.count}
            </Badge>
          ))}
          {durationSummary.slice(0, 3).map(({ label, count }) => (
            <Badge key={label} tone="neutral">
              {label} · {count}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((program) => (
          <ProgramCard key={program.slug} program={program} durationLabelMap={durationLabelMap} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6 text-sm">
        <Link href={filterHref} prefetch={false} className="text-accent-hover hover:underline">
          Open this search in the full filter bar
        </Link>
      </div>

      {(sameLocationOtherTypes.length > 0 || sameTypeOtherLocations.length > 0 || showAllTypesInLocation) && (
        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <h2 className="font-serif text-lg font-semibold text-foreground">Related pages</h2>
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
            {(showAllTypesInLocation || sameLocationOtherTypes.length > 0) && (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
                  Other program types in {location.label}
                </p>
                <div className="flex flex-col gap-1">
                  {showAllTypesInLocation && (
                    <Card
                      as={Link}
                      href={canonicalPathFor(null, locationSlug)}
                      prefetch={false}
                      interactive
                      className="px-3 py-2 text-sm text-foreground"
                    >
                      All programs in {location.label}
                    </Card>
                  )}
                  {sameLocationOtherTypes.map((t) => (
                    <Card
                      key={t.slug}
                      as={Link}
                      href={canonicalPathFor(t.slug, locationSlug)}
                      prefetch={false}
                      interactive
                      className="px-3 py-2 text-sm text-foreground"
                    >
                      {t.pluralLabel} in {location.label}
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {sameTypeOtherLocations.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
                  {type ? type.pluralLabel : "Programs"} in other regions
                </p>
                <div className="flex flex-col gap-1">
                  {sameTypeOtherLocations.map((l) => (
                    <Card
                      key={l.slug}
                      as={Link}
                      href={canonicalPathFor(typeSlug, l.slug)}
                      prefetch={false}
                      interactive
                      className="px-3 py-2 text-sm text-foreground"
                    >
                      {type ? type.pluralLabel : "Programs"} in {l.label}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
