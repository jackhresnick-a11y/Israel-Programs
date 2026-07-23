import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { generateOutreachContactsCsv } from "@/lib/outreachContacts";

export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const csv = generateOutreachContactsCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="program-contacts.csv"',
    },
  });
}
