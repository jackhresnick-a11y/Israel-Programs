import { NextResponse } from "next/server";

/**
 * TEMPORARILY DISABLED. The shared production DB's ContactRequest schema was migrated
 * ahead of this route by feature/alumni-references-double-optin (token/requesterName
 * are now NOT NULL with no default, and the status enum no longer contains OPEN) --
 * the createContactRequest call this route used to make would violate both constraints
 * on the live schema. Remove this guard (and the matching one in
 * components/ReferenceList.tsx) once that branch ships and replaces this route with its
 * double opt-in flow.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Contact requests are temporarily unavailable — please check back soon." },
    { status: 503 }
  );
}
