import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { contactRequestInputSchema, createContactRequest } from "@/lib/references";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to request contact" }, { status: 401 });
  }

  if (!checkRateLimit(`contact-request:${userId}`, { limit: 5, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
  }

  const { id } = await params;
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

  try {
    const body = await request.json();
    const input = contactRequestInputSchema.parse(body);
    const contactRequest = await createContactRequest(id, input, { userId, email: requesterEmail });
    return NextResponse.json(contactRequest, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // Unique constraint on [referenceId, requesterUserId] -- already sent an open request.
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
