import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getDurationLabelMap } from "@/lib/duration";
import { listRegions } from "@/lib/regions";
import { buildAuditRow, compareAuditRows, renderAuditCsv } from "@/lib/tagAudit";

// Serves the exact same CSV shape scripts/export-tag-audit.ts writes to disk, generated
// entirely in memory (no filesystem access -- this runs serverless). Row-building is
// shared via lib/tagAudit.ts so the two can never diverge.
export async function GET() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const programs = await prisma.program.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      name: true,
      slug: true,
      durationType: true,
      tags: { select: { slug: true, category: true } },
    },
    orderBy: { name: "asc" },
  });

  const durationLabels = await getDurationLabelMap();
  const regions = await listRegions();

  const rows = programs
    .map((p) => buildAuditRow(p, durationLabels, regions))
    .sort(compareAuditRows);

  const csv = renderAuditCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="tag-audit.csv"',
    },
  });
}
