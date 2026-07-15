"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Link from "next/link";

type ToastTone = "success" | "info";
type ToastAction = { label: string } & ({ href: string } | { onClick: () => void });
type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction };

const ToastContext = createContext<{
  toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-success/30 bg-success-bg text-success",
  info: "border-info/30 bg-info-bg text-info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "success", action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((items) => [...items, { id, message, tone, action }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${TONE_CLASSES[item.tone]}`}
          >
            <span>
              {item.message}
              {item.action && "href" in item.action && (
                <>
                  {" — "}
                  <Link href={item.action.href} className="font-semibold underline underline-offset-2">
                    {item.action.label}
                  </Link>
                </>
              )}
              {item.action && "onClick" in item.action && (
                <>
                  {" — "}
                  <button
                    type="button"
                    onClick={item.action.onClick}
                    className="font-semibold underline underline-offset-2"
                  >
                    {item.action.label}
                  </button>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
