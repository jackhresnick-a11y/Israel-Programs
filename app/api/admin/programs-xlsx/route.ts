import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { generateProgramsXlsxBuffer } from "@/lib/programExport";

export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const buffer = await generateProgramsXlsxBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="programs.xlsx"',
    },
  });
}
