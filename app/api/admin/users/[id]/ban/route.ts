import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/roles";

/**
 * Deliberately moderator-accessible (not admin-only like the general role
 * route), since banning a bad-actor submitter is a moderation action, not a
 * privilege-escalation one -- this route can only ever set "banned", never
 * promote someone to moderator/admin, so it can't be misused for that.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireRole("moderator");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;
  const client = await clerkClient();
  await client.users.updateUserMetadata(id, { publicMetadata: { role: "banned" } });

  return NextResponse.json({ id, role: "banned" });
}
