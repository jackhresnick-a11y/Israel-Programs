import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { listCounselorContacts, createCounselorContact } from "@/lib/counselorContacts";

const schoolSizeSchema = z.enum(["BIG", "SMALL"]);
const statusSchema = z.enum(["NOT_CONTACTED", "CONTACTED", "REPLIED", "BOUNCED", "WRONG_CONTACT"]);

const bodySchema = z.object({
  schoolName: z.string().trim().min(1, "School name is required"),
  country: z.string().trim().min(1, "Country is required"),
  cityRegion: z.string().trim().min(1, "City/region is required"),
  schoolSize: schoolSizeSchema.nullable().optional(),
  contactName: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().email("A valid email is required"),
  emailIsGeneric: z.boolean().optional(),
  sourceUrl: z.string().trim().url("A valid source URL is required"),
  notes: z.string().trim().min(1).nullable().optional(),
});

/** Admin-only: lists counselor contacts, optionally filtered by country/status. */
export async function GET(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? undefined;
  const statusParam = searchParams.get("status") ?? undefined;
  const status = statusParam ? statusSchema.parse(statusParam) : undefined;

  const contacts = await listCounselorContacts({ country, status });
  return NextResponse.json(contacts);
}

/** Admin-only: creates a new counselor contact. schoolName+country must be unique
 * (schema constraint) -- a duplicate returns 409 rather than a generic 500. */
export async function POST(request: Request) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  try {
    const input = bodySchema.parse(await request.json());
    const contact = await createCounselorContact(input);
    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A contact for that school already exists in that country" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
