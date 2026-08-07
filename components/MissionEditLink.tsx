"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/Button";

/** Admin-only "Edit" action on the Background page's header. Client-side so
 * app/mission/page.tsx (a public, cacheable read page) doesn't need a
 * server-side auth() call just to decide whether to show one link -- see
 * AccountMenu.tsx for the same pattern. */
export default function MissionEditLink() {
  const { user } = useUser();
  if (user?.publicMetadata?.role !== "admin") return null;

  return (
    <Link href="/mission/edit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
      Edit
    </Link>
  );
}
