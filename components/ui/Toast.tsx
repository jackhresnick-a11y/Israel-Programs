"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastTone = "success" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<{
  toast: (message: string, tone?: ToastTone) => void;
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
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setToasts((items) => [...items, { id, message, tone }]);
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
            <span>{item.message}</span>
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
