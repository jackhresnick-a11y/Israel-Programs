import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateCounselorContact, deleteCounselorContact } from "@/lib/counselorContacts";

type Params = { params: Promise<{ id: string }> };

const schoolSizeSchema = z.enum(["BIG", "SMALL"]);

const bodySchema = z.object({
  schoolName: z.string().trim().min(1, "School name is required").optional(),
  country: z.string().trim().min(1, "Country is required").optional(),
  cityRegion: z.string().trim().min(1, "City/region is required").optional(),
  schoolSize: schoolSizeSchema.nullable().optional(),
  contactName: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().email("A valid email is required").optional(),
  emailIsGeneric: z.boolean().optional(),
  sourceUrl: z.string().trim().url("A valid source URL is required").optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

/** Admin-only: updates a counselor contact. Changing email resets status to
 * NOT_CONTACTED -- see lib/counselorContacts.ts's updateCounselorContact. */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const input = bodySchema.parse(await request.json());
    const updated = await updateCounselorContact(id, input);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "A contact for that school already exists in that country" }, { status: 409 });
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

/** Admin-only: deletes a counselor contact (cascades to its CounselorContactEvent history). */
export async function DELETE(_request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    await deleteCounselorContact(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
