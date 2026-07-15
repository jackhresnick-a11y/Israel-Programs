import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/roles";
import { updateReferenceWhatsapp } from "@/lib/references";
import { optionalWhatsappNumberSchema } from "@/lib/phone";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    whatsappNumber: optionalWhatsappNumberSchema,
    whatsappNumberSource: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.whatsappNumber && !value.whatsappNumberSource) {
      ctx.addIssue({
        code: "custom",
        message: "A source is required for a WhatsApp number",
        path: ["whatsappNumberSource"],
      });
    }
  });

/**
 * Admin-only: set or clear a reference's WhatsApp number + its source.
 * An empty/absent whatsappNumber clears both fields.
 */
export async function PATCH(request: Request, { params }: Params) {
  const check = await requireRole("admin");
  if (!check.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: check.status });
  }

  const { id } = await params;

  try {
    const input = bodySchema.parse(await request.json());
    const updated = await updateReferenceWhatsapp(id, {
      whatsappNumber: input.whatsappNumber ?? null,
      whatsappNumberSource: input.whatsappNumberSource || null,
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update reference" }, { status: 500 });
  }
}
