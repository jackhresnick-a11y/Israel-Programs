import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { getSiteContent } from "@/lib/siteContent";
import { getOutreachFromAddress, sendOutreachEmail } from "@/lib/email";

export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 30;
const MAX_BATCH_SIZE = 100; // hard ceiling regardless of the configurable default
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

/**
 * Admin-only, manual-click-only send. Never scheduled -- this route only ever runs in
 * response to a POST from the admin outreach page's "Send next batch" button. Sends up
 * to N (SiteContent outreachBatchSize, default 30, hard-capped at 100) APPROVED rows,
 * plain-text, one at a time with a randomized 1-3s delay between sends. Refuses the
 * entire batch upfront if RESEND_FROM isn't a valid israelprogramswiki.com address --
 * there is no fallback sender for outreach (see lib/email.ts's getOutreachFromAddress).
 */
export async function POST() {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  if (!getOutreachFromAddress()) {
    return NextResponse.json(
      {
        error:
          "RESEND_FROM is not set to a valid israelprogramswiki.com address. " +
          "Complete the domain DNS setup in Resend and set RESEND_FROM before sending.",
      },
      { status: 409 }
    );
  }

  const rawBatchSize = await getSiteContent("outreachBatchSize");
  const parsed = rawBatchSize ? parseInt(rawBatchSize, 10) : NaN;
  const batchSize = Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);

  const rows = await prisma.outreachEmail.findMany({
    where: { status: "APPROVED" },
    take: batchSize,
    orderBy: { approvedAt: "asc" },
    include: { program: { select: { id: true, contactEmail: true, status: true } } },
  });

  let sent = 0;
  let failed = 0;
  let skippedChanged = 0;
  let skippedUnpublished = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Re-check the program is still published and its contactEmail still matches
    // what this draft was approved against -- an edit or unpublish between approval
    // and send must never cause a send to a now-stale/wrong address.
    if (row.program.status !== "PUBLISHED") {
      await prisma.outreachEmail.update({
        where: { id: row.id },
        data: { status: "DRAFT", note: "Program no longer published — reverted to draft." },
      });
      skippedUnpublished++;
      continue;
    }
    if (row.program.contactEmail !== row.toEmail) {
      await prisma.outreachEmail.update({
        where: { id: row.id },
        data: {
          status: "DRAFT",
          note: `contactEmail changed since approval (was ${row.toEmail}) — reverted to draft, please re-review.`,
        },
      });
      skippedChanged++;
      continue;
    }

    const result = await sendOutreachEmail({ to: row.toEmail, subject: row.subject, text: row.body });

    if (result.ok) {
      await prisma.outreachEmail.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), resendId: result.resendId, note: null },
      });
      sent++;
    } else {
      await prisma.outreachEmail.update({
        where: { id: row.id },
        data: { note: `Send failed: ${result.error}` },
      });
      failed++;
    }

    if (i < rows.length - 1) {
      await sleep(randomDelay());
    }
  }

  return NextResponse.json({ attempted: rows.length, sent, failed, skippedChanged, skippedUnpublished });
}
