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
  { href: "/admin/polls/reviews", label: "Reviews" },
  { href: "/admin/polls/faqs", label: "FAQs" },
] as const;

export default function PollsTabs({
  pendingReviewCount = 0,
  pendingQuestionCount = 0,
}: {
  pendingReviewCount?: number;
  pendingQuestionCount?: number;
}) {
  const pathname = usePathname();

  const badgeCounts: Partial<Record<(typeof TABS)[number]["href"], number>> = {
    "/admin/polls/reviews": pendingReviewCount,
    "/admin/polls/faqs": pendingQuestionCount,
  };

  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-4">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const badgeCount = badgeCounts[tab.href] ?? 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              buttonVariants({ variant: active ? "primary" : "secondary", size: "sm" }),
              "gap-1.5"
            )}
          >
            {tab.label}
            {badgeCount > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                  active ? "bg-white/25 text-accent-foreground" : "bg-accent/20 text-accent-hover dark:text-accent"
                )}
              >
                {badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
