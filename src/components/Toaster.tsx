"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, ToastAction } from "@/components/ui/toast";

type Variant = "default" | "success" | "destructive";

type ToastInput = {
  title?: string;
  description?: string;
  variant?: Variant;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

type ToastEntry = ToastInput & { id: number };

const ToasterContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToasterContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const push = useCallback((t: ToastInput) => {
    setToasts((p) => [...p, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  return (
    <ToasterContext.Provider value={{ push }}>
      <ToastProvider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <Toast
            key={t.id}
            duration={t.durationMs ?? 4000}
            variant={t.variant}
            onOpenChange={(open) => { if (!open) setToasts((p) => p.filter((x) => x.id !== t.id)); }}
          >
            <div className="flex-1 space-y-1">
              {t.title && <ToastTitle>{t.title}</ToastTitle>}
              {t.description && <ToastDescription>{t.description}</ToastDescription>}
            </div>
            {t.action && (
              <ToastAction altText={t.action.label} onClick={t.action.onClick}>
                {t.action.label}
              </ToastAction>
            )}
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToasterContext.Provider>
  );
}
