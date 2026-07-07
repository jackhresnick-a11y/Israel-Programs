import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";
import { getCurrentRole } from "@/lib/roles";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import { buttonVariants } from "@/components/ui/Button";

export default async function MissionPage() {
  const [body, role] = await Promise.all([
    getSiteContent("mission"),
    getCurrentRole(),
  ]);

  return (
    <PageContainer width="base" className="gap-6">
      <PageHeader
        title="Mission Statement"
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

      {body ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {body}
        </p>
      ) : (
        <p className="text-sm text-muted">
          No mission statement has been set yet.
        </p>
      )}
    </PageContainer>
  );
}
