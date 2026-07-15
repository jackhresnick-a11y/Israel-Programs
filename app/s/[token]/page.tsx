import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedFolder } from "@/lib/folders";
import { shareDescription } from "@/lib/programs";
import { SITE_NAME } from "@/lib/siteUrl";
import PageContainer from "@/components/ui/PageContainer";
import Card from "@/components/ui/Card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedFolder(token);
  if (!shared) {
    return { robots: { index: false, follow: false } };
  }

  const count = shared.programs.length;
  const title = `${shared.name} — ${count} ${count === 1 ? "program" : "programs"} on ${SITE_NAME}`;
  const names = shared.programs.slice(0, 3).map((p) => p.name);
  const remaining = count - names.length;
  const description =
    names.length > 0
      ? `Includes ${names.join(", ")}${remaining > 0 ? `, and ${remaining} more` : ""}.`
      : "A shared list on Israel Programs Wiki.";

  return {
    title,
    description,
    // Public, unlisted -- reachable only with the token, but deliberately
    // not indexed (a public link a stranger could stumble onto shouldn't
    // surface in search). No robots.txt disallow either -- see the folders
    // design doc: a disallow would stop crawlers from ever seeing this
    // noindex, and WhatsApp/Facebook's link-preview scrapers need to fetch
    // this page regardless to build the share card.
    robots: { index: false, follow: false },
    alternates: { canonical: `/s/${token}` },
    openGraph: {
      title,
      description,
      url: `/s/${token}`,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedFolderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getSharedFolder(token);
  if (!shared) notFound();

  return (
    <PageContainer width="base" className="gap-6">
      <div className="border-l-4 border-accent pl-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {shared.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {shared.programs.length} {shared.programs.length === 1 ? "program" : "programs"} shared via{" "}
          {SITE_NAME}
        </p>
      </div>

      {shared.unavailableCount > 0 && (
        <p className="text-sm text-muted">
          {shared.unavailableCount}{" "}
          {shared.unavailableCount === 1
            ? "program in this list is no longer available."
            : "programs in this list are no longer available."}
        </p>
      )}

      {shared.programs.length === 0 ? (
        <p className="text-sm text-muted">This list doesn&apos;t have any available programs right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {shared.programs.map((program) => (
            <Link key={program.id} href={`/programs/${program.slug}`}>
              <Card interactive className="flex flex-col gap-1 px-4 py-3">
                <span className="font-serif font-semibold text-foreground">{program.name}</span>
                {(program.organization || program.location) && (
                  <span className="text-xs text-muted">
                    {[program.organization, program.location].filter(Boolean).join(" · ")}
                  </span>
                )}
                <p className="text-sm text-foreground/80">{shareDescription(program.description, 160)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
