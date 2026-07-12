"use client";

import { usePathname } from "next/navigation";
import AssistantWidget from "@/components/AssistantWidget";

const HIDDEN_PREFIXES = ["/admin", "/sign-in", "/sign-up"];

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
