"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { TONE_DOT, TONE_SURFACE, type Tone } from "./tone";

/**
 * Confirmation that something happened.
 *
 * Every mutation in this app used to succeed in silence — a form would close, a
 * list would reload, and the user was left inferring success from the absence
 * of an error. That is the same signal as a request that did nothing.
 *
 * Deliberately NOT a notification: these are transient acknowledgements of an
 * action the user just took, they carry no history, and they are not the
 * Notification module. Anything worth keeping goes to the bell.
 */
type Toast = { id: number; tone: Tone; message: string };

const ToastContext = createContext<((message: string, tone?: Tone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Tone = "success") => {
    // Date.now() collides when two fire in the same millisecond, which is
    // exactly what an "upload then close" pair does.
    const id = Math.random();

    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        aria-live="polite" so a screen reader announces the confirmation without
        interrupting whatever it is currently reading. Bottom-centre on a phone,
        bottom-right on a desktop — never top, where it would cover the nav.
      */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-surface border border-border px-4 py-2.5 text-sm shadow-lg ${TONE_SURFACE[toast.tone]}`}
          >
            <span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[toast.tone]}`} />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);

  if (!show) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return show;
}
