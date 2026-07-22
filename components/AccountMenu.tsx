"use client";

import { UserButton } from "@clerk/nextjs";
import { toggleTheme } from "@/components/ThemeToggle";

const ICON_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
};

// Same bookmark path as components/BookmarkButton.tsx, for visual consistency.
function SavedIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6 3.75A1.75 1.75 0 0 1 7.75 2h8.5A1.75 1.75 0 0 1 18 3.75v17.5l-6-4-6 4V3.75Z" />
    </svg>
  );
}

function RequestsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 6.75A2.25 2.25 0 0 1 5.25 4.5h13.5A2.25 2.25 0 0 1 21 6.75v10.5A2.25 2.25 0 0 1 18.75 19.5H5.25A2.25 2.25 0 0 1 3 17.25V6.75Z" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6l-7-2.5Z" />
    </svg>
  );
}

// Same moon path as ThemeToggle.tsx's light-mode icon.
function ThemeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 12.5A8.5 8.5 0 1 1 11.5 4a7 7 0 0 0 8.5 8.5Z" />
    </svg>
  );
}

/**
 * Wraps Clerk's <UserButton> with the app's own nav destinations as custom menu
 * items -- moves Saved / My Reference Requests / (admin-only) Admin / the dark-mode
 * toggle off the header row and into the avatar menu, so the header fits one row on
 * mobile (see components/Nav.tsx, which only mounts this for a signed-in user).
 */
export default function AccountMenu({ isAdmin }: { isAdmin: boolean }) {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link href="/saved" label="Saved" labelIcon={<SavedIcon />} />
        <UserButton.Link
          href="/references/requests"
          label="My Reference Requests"
          labelIcon={<RequestsIcon />}
        />
        {isAdmin && <UserButton.Link href="/admin" label="Admin" labelIcon={<AdminIcon />} />}
        <UserButton.Action label="Dark mode" labelIcon={<ThemeIcon />} onClick={toggleTheme} />
      </UserButton.MenuItems>
    </UserButton>
  );
}
