"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps a native <details>/<summary> disclosure with the auto-close behavior
 * <details> can't do on its own: outside click, Escape, and clicking a link/button
 * inside the drawer. The summary's own click-to-toggle stays entirely native --
 * without JS (or before hydration), the drawer still opens and closes exactly as a
 * plain <details> always has; this only adds automatic closing on top of that, never
 * replaces it. `trigger` and `children` are ordinary server-rendered JSX (they can
 * include Server Components like next/link's <Link>) passed down from Nav.tsx, which
 * stays a server component itself -- only this open/close mechanism needs the client.
 */
export default function MobileNavDrawer({
  trigger,
  children,
  className,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const details = detailsRef.current;
      if (!details || !details.open) return;
      const target = event.target;
      // A click on the summary itself is the native open/close toggle -- never
      // second-guess that, whichever way it's about to flip. Every other click,
      // whether outside the drawer entirely or on a link/button inside it, closes it.
      if (target instanceof Element && target.closest("summary")) return;
      details.open = false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details ref={detailsRef} className={className}>
      {trigger}
      {children}
    </details>
  );
}
