import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, Show } from "@clerk/nextjs";
import { getCurrentRole } from "@/lib/roles";
import { getProgramBySlug, listAllTags } from "@/lib/programs";
import { listTagCategories } from "@/lib/tags";
import { listDurationOptions } from "@/lib/duration";
import ProgramForm from "@/components/ProgramForm";
import PageContainer from "@/components/ui/PageContainer";
import { buttonVariants } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

const STATUS_LABELS = {
  VERIFIED: "Verified",
  BOUNCED: "Bounced",
  WRONG_CONTACT: "Reached wrong contact",
} as const;
const STATUS_TONES = {
  VERIFIED: "success",
  BOUNCED: "danger",
  WRONG_CONTACT: "warning",
} as const;

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [program, role, { userId }, allTags, categories, durationOptions] = await Promise.all([
    getProgramBySlug(slug),
    getCurrentRole(),
    auth(),
    listAllTags(),
    listTagCategories(),
    listDurationOptions(),
  ]);
  if (!program) notFound();

  const isModerator = role === "moderator" || role === "admin";
  const isOwner = userId === program.createdById;
  if (program.status !== "PUBLISHED" && !isModerator && !isOwner) notFound();

  return (
    <PageContainer width="narrow" className="gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Edit {program.name}
        </h1>
        {!isModerator && (
          <p className="mt-2 text-sm text-muted">
            Your changes will be reviewed by a moderator before they go live.
          </p>
        )}
        {isModerator && program.contactEmail && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            Contact email:
            <Badge tone={program.contactEmailStatus ? STATUS_TONES[program.contactEmailStatus] : "neutral"}>
              {program.contactEmailStatus ? STATUS_LABELS[program.contactEmailStatus] : "Not yet verified"}
            </Badge>
            {program.contactEmailVerifiedAt && (
              <span>as of {program.contactEmailVerifiedAt.toLocaleDateString()}</span>
            )}
            {role === "admin" && (
              <Link href="/admin/email-verification" className="underline hover:text-foreground">
                verification queue
              </Link>
            )}
          </p>
        )}
        {isModerator && program.adminNote && (
          <p className="mt-2 rounded-md bg-warning-bg p-2 text-sm text-warning">
            <span className="font-medium">Admin note:</span> {program.adminNote}
          </p>
        )}
      </div>
      <Show
        when="signed-in"
        fallback={
          <SignInButton mode="modal">
            <button className={buttonVariants({ variant: "secondary" })}>
              Sign in to propose an edit
            </button>
          </SignInButton>
        }
      >
        <ProgramForm
          initial={{
            id: program.id,
            slug: program.slug,
            name: program.name,
            nameHe: program.nameHe ?? "",
            description: program.description,
            goodFor: program.goodFor ?? "",
            organization: program.organization ?? "",
            location: program.location ?? "",
            durationType: program.durationType,
            durationText: program.durationText ?? "",
            cost: program.cost ?? "",
            signupInstructions: program.signupInstructions ?? "",
            signupUrl: program.signupUrl ?? "",
            contactEmail: program.contactEmail ?? "",
            contactPhone: program.contactPhone ?? "",
            contactWebsite: program.contactWebsite ?? "",
            hasScholarship: program.hasScholarship ?? false,
            hasCollegeCredit: program.hasCollegeCredit ?? false,
            travelType: program.travelType ?? "",
            tags: program.tags.map((t) => t.name).join(", "),
            logoUrl: program.logoUrl,
          }}
          allTags={allTags}
          categories={categories}
          durationOptions={durationOptions}
          canRemoveLogo={isModerator}
        />
      </Show>
    </PageContainer>
  );
}
