import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { listFolders } from "@/lib/folders";
import NewFolderForm from "@/components/NewFolderForm";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

// Private, owner-only lists -- keep them out of the index the same way
// /admin is (robots.txt disallow), plus an explicit noindex here in case
// a saved-folder URL is ever linked from somewhere crawlable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SavedFoldersPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <PageContainer width="narrow" className="items-start gap-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          My saved programs
        </h1>
        <p className="text-sm text-muted">
          Sign in to save programs into folders and share your shortlists.
        </p>
        <SignInButton mode="modal">
          <button className={buttonVariants({ variant: "primary" })}>Sign in</button>
        </SignInButton>
      </PageContainer>
    );
  }

  const folders = await listFolders(userId);

  return (
    <PageContainer width="base" className="gap-6">
      <PageHeader title="My saved programs" description="Folders you've saved programs into, and any you've shared." />

      <NewFolderForm />

      {folders.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing saved yet — tap the bookmark icon on a program card to start a list.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {folders.map((folder) => (
            <Link key={folder.id} href={`/saved/${folder.id}`}>
              <Card interactive className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{folder.name}</span>
                  {folder.isDefault && <Badge tone="neutral">Default</Badge>}
                  {folder.isShared && <Badge tone="info">Shared</Badge>}
                </div>
                <span className="text-sm text-muted">
                  {folder.itemCount} {folder.itemCount === 1 ? "program" : "programs"}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
