import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import SiteLogoForm from "@/components/SiteLogoForm";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminSettingsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [logoUrl, logoMode] = await Promise.all([
    getSiteContent("headerLogoUrl"),
    getSiteContent("headerLogoMode"),
  ]);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Site Settings"
        description="Manage site-wide branding shown in the header."
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
    </PageContainer>
  );
}
