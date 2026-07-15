import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createReference, referenceInputSchema } from "@/lib/references";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to volunteer as a reference" }, { status: 401 });
  }

  const { id } = await params;
  const user = await currentUser();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    "Anonymous";
  const contactEmail = user?.primaryEmailAddress?.emailAddress;
  if (!contactEmail) {
    return NextResponse.json(
      { error: "Your account needs a verified email to become a reference" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const input = referenceInputSchema.parse(body);
    const reference = await createReference(id, input, { userId, displayName, contactEmail });
    // Only return what the author needs to see -- never the full row (which
    // includes contactEmail/whatsappNumber) over the wire, even to themselves.
    return NextResponse.json(
      {
        id: reference.id,
        displayName: reference.displayName,
        attendedText: reference.attendedText,
        note: reference.note,
        status: reference.status,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // Unique constraint on [programId, userId] -- already listed as a reference for this program.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "You've already volunteered as a reference for this program" },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to submit reference" }, { status: 500 });
  }
}
