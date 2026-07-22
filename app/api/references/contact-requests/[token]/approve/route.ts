import { NextResponse } from "next/server";
import { approveContactRequest } from "@/lib/references";
import { sendReferenceIntroEmails } from "@/lib/email";

type Params = { params: Promise<{ token: string }> };

/**
 * POST, not GET -- a bare-link side effect would let an email client's link-prefetch
 * scanner auto-approve a request and leak both parties' contact info. The confirm
 * page (app/references/approve/[token]/page.tsx) is what issues this POST, only after
 * an explicit click.
 */
export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  const result = await approveContactRequest(token);

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, status: result.status }, { status: 200 });
  }

  // Best-effort -- the request is already durably APPROVED regardless of send outcome.
  await sendReferenceIntroEmails({
    alumnusEmail: result.reference.contactEmail,
    alumnusName: result.reference.displayName,
    requesterEmail: result.requesterEmail,
    requesterName: result.requesterName,
    programName: result.program.name,
  });

  return NextResponse.json({ ok: true });
}
