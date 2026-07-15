import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireSignedInNotBanned } from "@/lib/roles";
import { mintShareToken, revokeShareToken } from "@/lib/folders";

// Minting a share link publishes a folder name to a public, token-based
// surface -- the same class of public UGC the ban is scoped to block (see
// lib/roles.ts's requireSignedInNotBanned doc comment). Revoking is not
// gated the same way: a banned user must still be able to pull down a link
// they already shared.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireSignedInNotBanned();
  if (!check.ok) {
    return NextResponse.json(
      { error: check.status === 403 ? "Your account is not permitted to share folders" : "Unauthorized" },
      { status: check.status }
    );
  }

  const { id } = await params;
  const result = await mintShareToken(check.userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await revokeShareToken(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
