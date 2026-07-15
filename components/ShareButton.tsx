"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { programUrl, SITE_NAME } from "@/lib/siteUrl";
import { cn } from "@/lib/cn";

/** Icon-button + share menu for a program card. Rendered only on surfaces that
 *  exclusively list PUBLISHED programs (listPrograms / getProgramsBySlugs both
 *  filter on status), so it takes no status prop -- placement itself is the
 *  invariant. */
export default function ShareButton({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const url = programUrl(slug);
  const text = `${name} — ${SITE_NAME}`;

  const channels = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    },
    {
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(`${text}\n${url}`)}`,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
  ];

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  async function onTriggerClick() {
    // Native sheet on touch devices (the only real path to Instagram/DMs/etc.
    // -- there is no web share URL for Instagram, so no button for it here).
    // Desktop always gets the menu, even where navigator.share exists, since
    // the desktop OS share sheet is thinner than our channel list.
    const preferNative =
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;

    if (preferNative) {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // user dismissed
        // any other failure falls through to the menu
      }
    }
    openMenu();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard");
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    // Menu is position:fixed at coordinates measured on open -- any scroll
    // invalidates them, so close rather than let it drift.
    function close() {
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onTriggerClick}
        aria-label={`Share ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border shadow-sm backdrop-blur transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-surface/90 text-muted hover:border-accent hover:text-accent"
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4" />
        </svg>
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={`Share ${name}`}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-50 min-w-44 rounded-lg border border-border bg-surface p-1.5 shadow-md"
          >
            {channels.map((c) => (
              <a
                key={c.label}
                role="menuitem"
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-muted"
              >
                {c.label}
              </a>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={copyLink}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted"
            >
              Copy link
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
