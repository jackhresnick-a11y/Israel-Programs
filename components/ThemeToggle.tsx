"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

/** Shared toggle logic -- also used by AccountMenu.tsx's mobile dark-mode menu action,
 * so both entry points flip the same document-class + localStorage state identically. */
export function toggleTheme() {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  localStorage.setItem("theme", next ? "dark" : "light");
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M20 12.5A8.5 8.5 0 1 1 11.5 4a7 7 0 0 0 8.5 8.5Z" />
    </svg>
  );
}

/**
 * `variant="menu"` renders a full-width, left-aligned row (icon + label) instead of
 * the icon-only circular button -- used inside components/Nav.tsx's mobile hamburger
 * `<details>` drawer, where a menu item needs to match the drawer's other links/buttons
 * rather than look like the header's own toggle. Both variants share the same
 * `toggleTheme()`/`isDark` state, just rendered differently.
 */
export default function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "menu" }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-foreground hover:bg-surface-muted"
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
        {isDark ? "Light mode" : "Dark mode"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className="flex h-8 w-8 items-center justify-center rounded-full text-primary-foreground/90 hover:text-accent"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
