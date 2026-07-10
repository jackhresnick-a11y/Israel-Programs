import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { generateEmailVerificationQueueCsv } from "@/lib/emailVerification";

export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const csv = await generateEmailVerificationQueueCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="email-verification-queue.csv"',
    },
  });
}
