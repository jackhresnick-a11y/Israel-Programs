import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireRole, normalizeRole } from "@/lib/roles";
import { revokeAllSharesForUser } from "@/lib/folders";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const body = await request.json();
  const role = normalizeRole(body.role);

  const client = await clerkClient();
  const user = await client.users.updateUserMetadata(id, {
    publicMetadata: { role },
  });

  // Same seam as the moderator-only ban route: this route can also land a
  // user on "banned" (it's a superset of that route's capability), so it
  // must pull down their shared folder links too, not just the dedicated
  // ban route.
  if (role === "banned") {
    await revokeAllSharesForUser(id);
  }

  return NextResponse.json({ id: user.id, role });
}
