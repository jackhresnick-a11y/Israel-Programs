"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import AssistantWidget from "@/components/AssistantWidget";

// "/rate" is here because the floating button overlaps the poll form's content on
// mobile -- it cut off the right-hand scale anchor label (style guide item 4).
const HIDDEN_PREFIXES = ["/admin", "/sign-in", "/sign-up", "/rate"];

/** Renders the assistant widget everywhere except admin/auth routes. The
 * site-wide toggle (assistantEnabled) is resolved server-side in app/layout.tsx
 * and passed in as `enabledSiteWide`; the "admins always see it regardless of
 * the toggle" override is resolved here, client-side, from Clerk's cached user
 * object (publicMetadata is exposed via the Frontend API) -- this keeps
 * app/layout.tsx from needing a server-side auth() call on every page just for
 * this one override. */
export default function AssistantWidgetMount({ enabledSiteWide }: { enabledSiteWide: boolean }) {
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  if (!enabledSiteWide && !isAdmin) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return <AssistantWidget />;
}
