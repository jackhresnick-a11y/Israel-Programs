import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { generateCounselorContactsCsv } from "@/lib/counselorContacts";

export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const csv = await generateCounselorContactsCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="counselor-contacts.csv"',
    },
  });
}
