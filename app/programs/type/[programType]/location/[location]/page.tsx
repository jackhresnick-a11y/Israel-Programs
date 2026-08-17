import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  listLocationRoutes,
  getLocationPageData,
  findLocationFacet,
  findTypeFacet,
} from "@/lib/locationPages";
import { canonicalPathFor } from "@/lib/locationPagesContent";
import LocationLandingPage from "@/components/LocationLandingPage";
import { SITE_NAME } from "@/lib/siteUrl";

// See app/programs/location/[location]/page.tsx's comment -- same fixed-set,
// dynamicParams: false approach, just over the type x location combinations that
// clear the threshold (currently 12).
export async function generateStaticParams() {
  const routes = await listLocationRoutes();
  return routes
    .filter((r): r is typeof r & { typeSlug: string } => r.typeSlug !== null)
    .map((r) => ({ programType: r.typeSlug, location: r.locationSlug }));
}
export const dynamicParams = false;
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ programType: string; location: string }>;
}): Promise<Metadata> {
  const { programType: typeSlug, location: locationSlug } = await params;
  const location = findLocationFacet(locationSlug);
  const type = findTypeFacet(typeSlug);
  if (!location || !type) return { robots: { index: false, follow: false } };

  const data = await getLocationPageData(typeSlug, locationSlug);
  if (!data) return { robots: { index: false, follow: false } };

  const title = `${type.pluralLabel} in ${location.label}`;
  const description = data.copy.intro;
  const path = canonicalPathFor(typeSlug, locationSlug);

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

export default async function TypeLocationPage({
  params,
}: {
  params: Promise<{ programType: string; location: string }>;
}) {
  const { programType: typeSlug, location: locationSlug } = await params;
  const [data, allRoutes] = await Promise.all([
    getLocationPageData(typeSlug, locationSlug),
    listLocationRoutes(),
  ]);
  if (!data) notFound();

  return (
    <LocationLandingPage typeSlug={typeSlug} locationSlug={locationSlug} data={data} allRoutes={allRoutes} />
  );
}
