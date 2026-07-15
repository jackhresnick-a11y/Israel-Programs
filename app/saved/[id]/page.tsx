import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getFolder } from "@/lib/folders";
import FolderDetailControls from "@/components/FolderDetailControls";
import FolderShareControl from "@/components/FolderShareControl";
import FolderItemsList from "@/components/FolderItemsList";
import PageContainer from "@/components/ui/PageContainer";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SavedFolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) notFound();

  const { id } = await params;
  const result = await getFolder(userId, id);
  if (!result.ok) notFound();
  const folder = result.data;

  return (
    <PageContainer width="base" className="gap-6">
      <div className="flex flex-col gap-4 border-l-4 border-accent pl-4">
        <FolderDetailControls folderId={folder.id} initialName={folder.name} />
        <FolderShareControl folderId={folder.id} initialShareToken={folder.shareToken} />
      </div>

      <FolderItemsList folderId={folder.id} initialItems={folder.items} />
    </PageContainer>
  );
}
