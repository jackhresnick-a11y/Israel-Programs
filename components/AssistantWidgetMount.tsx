"use client";

import { usePathname } from "next/navigation";
import AssistantWidget from "@/components/AssistantWidget";

// "/rate" is here because the floating button overlaps the poll form's content on
// mobile -- it cut off the right-hand scale anchor label (style guide item 4).
const HIDDEN_PREFIXES = ["/admin", "/sign-in", "/sign-up", "/rate"];

/** Renders the assistant widget everywhere except admin/auth routes. The
 * visibility decision itself (admin-or-toggle-on) is made server-side in
 * app/layout.tsx and passed in as `show` -- this component only adds the
 * cheap client-side path check on top, so the DB reads aren't duplicated
 * per-navigation and there's no waterfall. */
export default function AssistantWidgetMount({ show }: { show: boolean }) {
  const pathname = usePathname();
  if (!show) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return <AssistantWidget />;
}
