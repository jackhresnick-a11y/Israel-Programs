import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireRole } from "@/lib/roles";
import { getXlsxPath, xlsxExists } from "@/lib/xlsxSync";

export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  if (!xlsxExists()) {
    return NextResponse.json({ error: "No spreadsheet has been generated yet" }, { status: 404 });
  }

  const file = await readFile(getXlsxPath());
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="programs.xlsx"',
    },
  });
}
