import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireRole, normalizeRole } from "@/lib/roles";

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

  return NextResponse.json({ id: user.id, role });
}
