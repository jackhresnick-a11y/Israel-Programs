"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/Button";

const TABS = [
  { href: "/admin/email/contacts", label: "Contact Emails" },
  { href: "/admin/email/verification", label: "Verification" },
  { href: "/admin/email/outreach", label: "Outreach" },
  { href: "/admin/email/templates", label: "Templates" },
  { href: "/admin/email/test", label: "Test" },
  { href: "/admin/email/counselors", label: "Counselors" },
] as const;

export default function EmailTabs() {
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
