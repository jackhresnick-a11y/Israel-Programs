import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";
import { getMissionBlocks } from "@/lib/mission";
import { getCurrentRole } from "@/lib/roles";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import EmblemDefault from "@/components/EmblemDefault";
import MissionIcon from "@/components/MissionIcon";
import FormattedText from "@/components/FormattedText";
import { buttonVariants } from "@/components/ui/Button";

export default async function MissionPage() {
  const [blocks, legacyBody, emblemUrl, emblemUrlDark, role] = await Promise.all([
    getMissionBlocks(),
    getSiteContent("mission"),
    getSiteContent("emblemLogoUrl"),
    getSiteContent("emblemLogoUrlDark"),
    getCurrentRole(),
  ]);

  return (
    <PageContainer width="base" className="gap-8">
      <div className="flex justify-center">
        {emblemUrl ? (
          <>
            {/* External Blob URL — plain img avoids next/image remotePatterns config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={emblemUrl}
              alt="Israel Program Wiki emblem"
              className={`h-40 w-40 sm:h-48 sm:w-48 ${emblemUrlDark ? "dark:hidden" : ""}`}
            />
            {emblemUrlDark && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={emblemUrlDark}
                alt="Israel Program Wiki emblem"
                className="hidden h-40 w-40 sm:h-48 sm:w-48 dark:block"
              />
            )}
          </>
        ) : (
          <EmblemDefault className="h-40 w-40 sm:h-48 sm:w-48" />
        )}
      </div>

      <PageHeader
        title="Background of Israel Programs Wiki"
        actions={
          role === "admin" ? (
            <Link
              href="/mission/edit"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Edit
            </Link>
          ) : undefined
        }
      />

      {blocks ? (
        <div className="flex flex-col gap-6">
          {blocks.map((block, i) => (
            <div key={i} className="flex flex-col gap-6">
              {i > 0 && <hr className="border-t border-accent/40" />}
              <div className="flex gap-4 sm:gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-hover dark:text-accent">
                  <MissionIcon icon={block.icon} />
                </div>
                <div className="flex flex-col gap-2">
                  {block.heading && (
                    <h2 className="font-serif text-lg font-semibold text-foreground">
                      {block.heading}
                    </h2>
                  )}
                  {block.body.split(/\n\n+/).map((paragraph, j) => (
                    <p key={j} className="text-sm leading-relaxed text-foreground/80">
                      <FormattedText text={paragraph} />
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : legacyBody ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {legacyBody}
        </p>
      ) : (
        <p className="text-sm text-muted">No content has been set yet.</p>
      )}
    </PageContainer>
  );
}
