import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { contactRequestInputSchema, createContactRequest } from "@/lib/references";
import { sendReferenceApprovalEmail } from "@/lib/email";
import { referenceApproveUrl, referenceDeclineUrl } from "@/lib/siteUrl";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to request contact" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const input = contactRequestInputSchema.parse(body);

    // Honeypot tripped: pretend success, do nothing. Checked before the rate
    // limit so a bot never learns a limiter exists.
    if (input.website) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (!checkRateLimit(`reference-contact:${userId}`, { limit: 5, windowMs: 10 * 60_000 })) {
      return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
    }

    const reference = await prisma.reference.findUnique({ where: { id }, select: { status: true } });
    if (!reference || reference.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = await currentUser();
    const requesterEmail = user?.primaryEmailAddress?.emailAddress;
    if (!requesterEmail) {
      return NextResponse.json(
        { error: "Your account needs a verified email to send a request" },
        { status: 400 }
      );
    }
    const requesterName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "A prospective student";

    const { request: contactRequest } = await createContactRequest(id, input, {
      userId,
      email: requesterEmail,
      name: requesterName,
    });

    // Best-effort -- a failed send leaves the request AWAITING_ALUMNUS and the
    // 3-day reminder cron gets a second chance at it.
    await sendReferenceApprovalEmail({
      to: contactRequest.reference.contactEmail,
      requesterName,
      requesterNote: contactRequest.note,
      programName: contactRequest.reference.program.name,
      approveUrl: referenceApproveUrl(contactRequest.token),
      declineUrl: referenceDeclineUrl(contactRequest.token),
    });

    // Never return the token or the reference's contactEmail to the requester.
    return NextResponse.json({ id: contactRequest.id, status: contactRequest.status }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // Unique constraint on [referenceId, requesterUserId] -- already sent a request.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "You've already sent a request to this reference" },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to send request" }, { status: 500 });
  }
}
