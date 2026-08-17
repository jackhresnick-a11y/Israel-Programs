import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listLocationRoutes, getLocationPageData, findLocationFacet } from "@/lib/locationPages";
import { canonicalPathFor } from "@/lib/locationPagesContent";
import LocationLandingPage from "@/components/LocationLandingPage";
import { SITE_NAME } from "@/lib/siteUrl";

// Small, fixed set (currently 5) -- unlike app/programs/[slug]/page.tsx's deliberate
// generateStaticParams() => [] (500+ programs, times out against production Neon), this
// prerenders every route it lists at build time. dynamicParams: false turns any
// combination NOT returned here into a genuine 404 rather than a per-request render --
// a below-threshold location must never get a thin/live page.
export async function generateStaticParams() {
  const routes = await listLocationRoutes();
  return routes.filter((r) => r.typeSlug === null).map((r) => ({ location: r.locationSlug }));
}
export const dynamicParams = false;
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string }>;
}): Promise<Metadata> {
  const { location: locationSlug } = await params;
  const location = findLocationFacet(locationSlug);
  if (!location) return { robots: { index: false, follow: false } };

  const data = await getLocationPageData(null, locationSlug);
  if (!data) return { robots: { index: false, follow: false } };

  const title = `Programs in ${location.label}`;
  const description = data.copy.intro;
  const path = canonicalPathFor(null, locationSlug);

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: SITE_NAME,
      images: "/opengraph-image",
    },
  };
}

export default async function LocationOnlyPage({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location: locationSlug } = await params;
  const [data, allRoutes] = await Promise.all([
    getLocationPageData(null, locationSlug),
    listLocationRoutes(),
  ]);
  if (!data) notFound();

  return (
    <LocationLandingPage typeSlug={null} locationSlug={locationSlug} data={data} allRoutes={allRoutes} />
  );
}
