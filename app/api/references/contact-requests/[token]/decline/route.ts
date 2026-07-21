import { NextResponse } from "next/server";
import { declineContactRequest } from "@/lib/references";
import { sendReferenceDeclinedEmail } from "@/lib/email";

type Params = { params: Promise<{ token: string }> };

/** POST, not GET -- same link-prefetch-safety reasoning as the approve route. */
export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  const result = await declineContactRequest(token);

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }

  // Best-effort -- the request is already durably DECLINED regardless of send outcome.
  await sendReferenceDeclinedEmail(result.requesterEmail, result.program.name);

  return NextResponse.json({ ok: true });
}
