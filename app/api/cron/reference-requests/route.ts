import { NextResponse } from "next/server";
import {
  listDueReminders,
  markReminderSent,
  listExpiredCandidates,
  expireContactRequest,
} from "@/lib/references";
import { sendReferenceReminderEmail, sendReferenceExpiredEmail } from "@/lib/email";
import { referenceApproveUrl, referenceDeclineUrl } from "@/lib/siteUrl";

/**
 * Daily Vercel Cron sweep (see vercel.json) -- the project's first scheduled job.
 * Handles both the 3-day reminder and the 30-day quiet expiry for Alumni Reference
 * contact requests still AWAITING_ALUMNUS. Guarded by CRON_SECRET, which Vercel Cron
 * sends automatically as a Bearer token when the env var is set
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/reference-requests] CRON_SECRET is not configured — refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let remindersSent = 0;
  for (const due of await listDueReminders()) {
    const sent = await sendReferenceReminderEmail({
      to: due.alumnusEmail,
      requesterName: due.requesterName,
      requesterNote: due.note,
      programName: due.programName,
      approveUrl: referenceApproveUrl(due.token),
      declineUrl: referenceDeclineUrl(due.token),
    });
    // Mark sent regardless of email success -- this is a one-shot reminder, not a
    // retry queue; a failed send here isn't retried by design (matches the "email is
    // best-effort" posture elsewhere in the app).
    if (sent) remindersSent++;
    await markReminderSent(due.id);
  }

  let expired = 0;
  for (const candidate of await listExpiredCandidates()) {
    const result = await expireContactRequest(candidate.id);
    if (result.count === 0) continue;
    expired++;
    await sendReferenceExpiredEmail(candidate.requesterEmail, candidate.programName);
  }

  return NextResponse.json({ ok: true, remindersSent, expired });
}
