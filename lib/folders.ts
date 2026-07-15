import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toPublicProgram } from "@/lib/programs";

export const MAX_FOLDERS_PER_USER = 50;
export const MAX_ITEMS_PER_FOLDER = 200;

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Folder name is required")
  .max(80, "Folder name is too long");

export const folderItemSchema = z.object({
  programId: z.string().min(1).max(64),
});

/** Mirrors lib/roles.ts's RoleCheck shape. Ownership failure and plain
 *  nonexistence are always the SAME messageless 404 -- never distinguish
 *  them, or the response becomes an oracle for which folder ids exist. */
export type FolderResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 404; message?: string };

const NOT_FOUND = { ok: false, status: 404 } as const;

// Fields a folder card/list needs to render -- narrower than the full Program
// row (no tags/videos/reviews) and, critically, never includes adminNote /
// contactEmailSource / outreachCategory. toPublicProgram() is applied on top
// anyway as defense-in-depth: a folder's viewer (owner or anonymous shared-link
// visitor) is an arbitrary site user, not necessarily a program moderator, so
// the same field discipline the public JSON API uses applies here too, not
// just to the token-based shared view.
const FOLDER_PROGRAM_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  location: true,
  organization: true,
  durationType: true,
  status: true,
} as const;

function generateShareToken(): string {
  // 192 bits, URL-safe -- unguessable, never derived from userId/folderId/name.
  return randomBytes(24).toString("base64url");
}

function isLiveItem(item: { programId: string | null; program: { status: string } | null }) {
  return item.programId !== null && item.program?.status === "PUBLISHED";
}

export async function listFolders(userId: string) {
  const folders = await prisma.folder.findMany({
    where: { ownerId: userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return Promise.all(
    folders.map(async (folder) => ({
      id: folder.id,
      name: folder.name,
      isDefault: folder.isDefault,
      isShared: folder.shareToken !== null,
      itemCount: await prisma.folderItem.count({
        where: { folderId: folder.id, programId: { not: null } },
      }),
    }))
  );
}

/** Folder ids (owned by userId) that already contain programId -- feeds the
 *  picker popover's checkbox state. Always scoped by ownerId in the same
 *  where clause; never returns another user's folders. */
export async function getMembership(userId: string, programId: string): Promise<string[]> {
  const items = await prisma.folderItem.findMany({
    where: { programId, folder: { ownerId: userId } },
    select: { folderId: true },
  });
  return items.map((item) => item.folderId);
}

export async function getFolder(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: userId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { program: { select: FOLDER_PROGRAM_SELECT } },
      },
    },
  });
  if (!folder) return NOT_FOUND as FolderResult<never>;

  // Owner's own view: label-don't-hide -- unavailable items are shown with a
  // status label, not dropped, so the owner can find and remove them.
  const items = folder.items.map((item) => ({
    id: item.id,
    program: item.program ? toPublicProgram(item.program) : null,
    unavailable: !isLiveItem(item),
  }));

  return {
    ok: true,
    data: {
      id: folder.id,
      name: folder.name,
      isDefault: folder.isDefault,
      // The live token itself, not just a boolean -- this is the owner's own
      // view (already ownership-checked above), so returning it lets the
      // owner copy their existing link again without forcing a re-mint
      // (which would rotate the token and silently break every copy already
      // sent out). A "generate new link" action is a separate, explicit
      // mintShareToken call, not something merely opening this page triggers.
      shareToken: folder.shareToken,
      items,
    },
  } satisfies FolderResult<unknown>;
}

export async function createFolder(userId: string, name: string): Promise<FolderResult<{ id: string; name: string }>> {
  const parsed = folderNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "Invalid folder name" };
  }

  const count = await prisma.folder.count({ where: { ownerId: userId } });
  if (count >= MAX_FOLDERS_PER_USER) {
    return { ok: false, status: 400, message: `You can have at most ${MAX_FOLDERS_PER_USER} folders.` };
  }

  const folder = await prisma.folder.create({ data: { ownerId: userId, name: parsed.data } });
  return { ok: true, data: { id: folder.id, name: folder.name } };
}

export async function renameFolder(
  userId: string,
  folderId: string,
  name: string
): Promise<FolderResult<{ id: string; name: string }>> {
  const parsed = folderNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "Invalid folder name" };
  }

  // Ownership enforced inside the mutation itself -- a folderId belonging to
  // another user simply matches zero rows, atomically, with no separate
  // read-then-write gap a future route could get wrong.
  const result = await prisma.folder.updateMany({
    where: { id: folderId, ownerId: userId },
    data: { name: parsed.data },
  });
  if (result.count === 0) return NOT_FOUND;
  return { ok: true, data: { id: folderId, name: parsed.data } };
}

export async function deleteFolder(userId: string, folderId: string): Promise<FolderResult<null>> {
  const result = await prisma.folder.deleteMany({ where: { id: folderId, ownerId: userId } });
  if (result.count === 0) return NOT_FOUND;
  return { ok: true, data: null };
}

/** Files a program into a folder. Validates programId refers to an existing
 *  PUBLISHED program (else the same 404 as a bad folderId) so a crafted
 *  request can't file -- or probe the existence of -- a PENDING/REJECTED
 *  program by guessing its id. Idempotent: adding an already-present program
 *  succeeds without creating a duplicate row. */
export async function addProgramToFolder(
  userId: string,
  folderId: string,
  programId: string
): Promise<FolderResult<{ id: string }>> {
  const parsed = folderItemSchema.safeParse({ programId });
  if (!parsed.success) return { ok: false, status: 400, message: "Invalid program id" };

  return prisma.$transaction(async (tx) => {
    const folder = await tx.folder.findFirst({ where: { id: folderId, ownerId: userId } });
    if (!folder) return NOT_FOUND;

    const program = await tx.program.findFirst({
      where: { id: parsed.data.programId, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!program) return NOT_FOUND;

    const existing = await tx.folderItem.findFirst({
      where: { folderId, programId: parsed.data.programId },
    });
    if (existing) return { ok: true, data: { id: existing.id } };

    const liveCount = await tx.folderItem.count({
      where: { folderId, programId: { not: null } },
    });
    if (liveCount >= MAX_ITEMS_PER_FOLDER) {
      return {
        ok: false,
        status: 400,
        message: `A folder can hold at most ${MAX_ITEMS_PER_FOLDER} programs.`,
      };
    }

    const item = await tx.folderItem.create({
      data: { folderId, programId: parsed.data.programId },
    });
    return { ok: true, data: { id: item.id } };
  });
}

export async function removeProgramFromFolder(
  userId: string,
  folderId: string,
  programId: string
): Promise<FolderResult<null>> {
  const result = await prisma.folderItem.deleteMany({
    where: { folderId, programId, folder: { ownerId: userId } },
  });
  if (result.count === 0) return NOT_FOUND;
  return { ok: true, data: null };
}

/** Saves a program to the user's default folder, lazily creating it on
 *  first use. Reuses addProgramToFolder for the actual write so the
 *  PUBLISHED check, cap, and dedupe logic live in exactly one place. */
export async function saveToDefaultFolder(
  userId: string,
  programId: string
): Promise<FolderResult<{ folderId: string }>> {
  let folder = await prisma.folder.findFirst({ where: { ownerId: userId, isDefault: true } });
  if (!folder) {
    folder = await prisma.folder.create({
      data: { ownerId: userId, name: "My saved programs", isDefault: true },
    });
  }

  const result = await addProgramToFolder(userId, folder.id, programId);
  if (!result.ok) return result;
  return { ok: true, data: { folderId: folder.id } };
}

/** Deletes unavailable (tombstoned or unpublished) items from a folder the
 *  caller owns. Ownership checked via a preceding read (the
 *  markContactRequestReplied pattern from lib/references.ts) since folder
 *  ownership is immutable once created -- no route ever reassigns ownerId. */
export async function clearUnavailableItems(
  userId: string,
  folderId: string
): Promise<FolderResult<{ cleared: number }>> {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, ownerId: userId } });
  if (!folder) return NOT_FOUND;

  const items = await prisma.folderItem.findMany({
    where: { folderId },
    include: { program: { select: { status: true } } },
  });
  const staleIds = items.filter((item) => !isLiveItem(item)).map((item) => item.id);
  if (staleIds.length === 0) return { ok: true, data: { cleared: 0 } };

  const result = await prisma.folderItem.deleteMany({ where: { id: { in: staleIds } } });
  return { ok: true, data: { cleared: result.count } };
}

/** Always rotates -- a revoked link can never be resurrected by re-sharing.
 *  Ban gating (requireSignedInNotBanned) lives in the route, not here. */
export async function mintShareToken(
  userId: string,
  folderId: string
): Promise<FolderResult<{ shareToken: string }>> {
  const shareToken = generateShareToken();
  const result = await prisma.folder.updateMany({
    where: { id: folderId, ownerId: userId },
    data: { shareToken },
  });
  if (result.count === 0) return NOT_FOUND;
  return { ok: true, data: { shareToken } };
}

export async function revokeShareToken(userId: string, folderId: string): Promise<FolderResult<null>> {
  const result = await prisma.folder.updateMany({
    where: { id: folderId, ownerId: userId },
    data: { shareToken: null },
  });
  if (result.count === 0) return NOT_FOUND;
  return { ok: true, data: null };
}

/** Ban-route-only exception to the userId-first rule: targetUserId is the
 *  person being banned, not the caller. Nulls every live share token they
 *  own so a folder name stops being reachable on a public surface the
 *  instant the ban takes effect -- unbanning does NOT restore tokens
 *  (mintShareToken always rotates), matching the ban's narrow, one-way
 *  scope documented in lib/roles.ts. Called from both ban write paths:
 *  /api/admin/users/[id]/role (when role becomes "banned") and
 *  /api/admin/users/[id]/ban. */
export async function revokeAllSharesForUser(targetUserId: string): Promise<void> {
  await prisma.folder.updateMany({
    where: { ownerId: targetUserId, shareToken: { not: null } },
    data: { shareToken: null },
  });
}

/** Public, token-authenticated read. The token IS the credential -- no
 *  userId, no ownership check. Returns only what a shared-link visitor
 *  should ever see: no ownerId, no folder/item ids, PUBLISHED programs via
 *  toPublicProgram(), and a single unavailableCount rather than any name or
 *  placeholder for dead entries (a non-public program's name must never
 *  reach this surface, even as a "removed" label). */
export async function getSharedFolder(token: string) {
  const folder = await prisma.folder.findUnique({
    where: { shareToken: token },
    include: {
      items: { include: { program: { select: FOLDER_PROGRAM_SELECT } } },
    },
  });
  if (!folder) return null;

  const programs = [];
  let unavailableCount = 0;
  for (const item of folder.items) {
    if (isLiveItem(item) && item.program) {
      programs.push(toPublicProgram(item.program));
    } else {
      unavailableCount++;
    }
  }

  return { name: folder.name, programs, unavailableCount };
}
