"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/Button";

const TABS = [
  { href: "/admin/polls/questions", label: "Questions" },
  { href: "/admin/polls/buckets", label: "Buckets" },
  { href: "/admin/polls/programs", label: "Programs" },
  { href: "/admin/polls/links", label: "Links" },
  { href: "/admin/polls/moderation", label: "Moderation" },
] as const;

export default function PollsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-4">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              buttonVariants({ variant: active ? "primary" : "secondary", size: "sm" })
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
