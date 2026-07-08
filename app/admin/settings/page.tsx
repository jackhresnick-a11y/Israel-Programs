import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import SiteLogoForm from "@/components/SiteLogoForm";
import BackgroundLogoForm from "@/components/BackgroundLogoForm";
import HomeLogoForm from "@/components/HomeLogoForm";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminSettingsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [
    logoUrl,
    logoMode,
    backgroundUrl,
    backgroundEnabled,
    backgroundOpacity,
    backgroundSizeDesktop,
    backgroundOffsetYDesktop,
    backgroundSizeMobile,
    backgroundOffsetYMobile,
    homeUrl,
    homeEnabled,
    homeSizeDesktop,
    homeOffsetXDesktop,
    homeOffsetYDesktop,
    homeSizeMobile,
    homeOffsetXMobile,
    homeOffsetYMobile,
  ] = await Promise.all([
    getSiteContent("headerLogoUrl"),
    getSiteContent("headerLogoMode"),
    getSiteContent("backgroundLogoUrl"),
    getSiteContent("backgroundLogoEnabled"),
    getSiteContent("backgroundLogoOpacity"),
    getSiteContent("backgroundLogoSize"),
    getSiteContent("backgroundLogoOffsetY"),
    getSiteContent("backgroundLogoSizeMobile"),
    getSiteContent("backgroundLogoOffsetYMobile"),
    getSiteContent("homeLogoUrl"),
    getSiteContent("homeLogoEnabled"),
    getSiteContent("homeLogoSize"),
    getSiteContent("homeLogoOffsetX"),
    getSiteContent("homeLogoOffsetY"),
    getSiteContent("homeLogoSizeMobile"),
    getSiteContent("homeLogoOffsetXMobile"),
    getSiteContent("homeLogoOffsetYMobile"),
  ]);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Site Settings"
        description="Manage site-wide branding shown in the header and browse page."
      />
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Site Logo
        </h2>
        <SiteLogoForm
          currentLogoUrl={logoUrl}
          currentMode={logoMode === "alongside" ? "alongside" : logoMode === "replace" ? "replace" : null}
        />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Background Logo
        </h2>
        <p className="text-sm text-muted">
          A large, subtle watermark shown behind the Browse Programs heading and search bar.
          This is a separate image from the header logo above.
        </p>
        <BackgroundLogoForm
          currentUrl={backgroundUrl}
          currentEnabled={backgroundEnabled === "true"}
          currentOpacity={Number(backgroundOpacity) || 5}
          currentDesktop={{
            size: Number(backgroundSizeDesktop) || 280,
            offsetY: Number(backgroundOffsetYDesktop) || 0,
          }}
          currentMobile={{
            size: Number(backgroundSizeMobile) || 150,
            offsetY: Number(backgroundOffsetYMobile) || 0,
          }}
        />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Homepage Logo
        </h2>
        <p className="text-sm text-muted">
          A large logo shown on the homepage next to the welcome heading. This is a
          separate image from the header logo and background logo above.
        </p>
        <HomeLogoForm
          currentUrl={homeUrl}
          currentEnabled={homeEnabled === "true"}
          currentDesktop={{
            size: Number(homeSizeDesktop) || 320,
            offsetX: Number(homeOffsetXDesktop) || 0,
            offsetY: Number(homeOffsetYDesktop) || 0,
          }}
          currentMobile={{
            size: Number(homeSizeMobile) || 160,
            offsetX: Number(homeOffsetXMobile) || 0,
            offsetY: Number(homeOffsetYMobile) || 0,
          }}
        />
      </section>
    </PageContainer>
  );
}
