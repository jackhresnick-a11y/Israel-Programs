import { NextResponse } from "next/server";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { markFlowSessionSubmitted } from "@/lib/flowRun";

/**
 * The explicit-submit action from the review screen (find-v2-question-spec.md:
 * "Submit at the end -- explicit, not auto-advance"). A plain HTML form POST (not
 * fetch), so it works with JavaScript disabled; the 303 redirect is what lets the
 * browser follow it as a GET without a resubmit warning. `id` is a bare FlowSession
 * id capability, same posture as the poll system's per-response routes -- there's no
 * auth concept for an anonymous flow session to check against.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`match-submit:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
  }

  const { id } = await params;
  const formData = await request.formData();
  const resultHrefRaw = String(formData.get("resultHref") ?? "");
  // resultHref is attacker-controlled form data -- never trust it as an arbitrary
  // redirect target. Only ever redirect within this app's own results path.
  const resultHref = resultHrefRaw.startsWith("/match/results") ? resultHrefRaw : "/match/results";

  await markFlowSessionSubmitted(id, resultHref);
  return NextResponse.redirect(new URL(resultHref, request.url), 303);
}
